const axios = require('axios');
const tlejs = require('tle.js');
const fs = require('fs');

const ERR_LOG_FILE = 'error.log';
const db_updates = {};

const fetchAndParseCelesTrackTLEs = async() => {
    try {
        if (db_updates['celestrak'] && (Math.floor(new Date().now() / 1000) - db_updates['celestrak']) < 3600) {
            return console.log('Celestrak TLEs already updated within the last hour');
        }

        const url = 'https://celestrak.com/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';
        const response = await axios.get(url);
        const data = response.data;
  
        // Save data to a file
        fs.writeFileSync('celestrak_tles.txt', data);
        console.log('Celestrak TLEs saved to celestrak_tles.txt');

        // Split the data into individual TLEs
        const tleLines = data.trim().split('\n');
        const satellites = [];
  
        for (let i = 0; i < tleLines.length; i += 3) {
            const name = tleLines[i].trim();
            const line1 = tleLines[i + 1].trim();
            const line2 = tleLines[i + 2].trim();
            // TLE parsing
            const tle = `${line1}\n${line2}`;
            try {
                const satInfo = tlejs.getSatelliteInfo(tle);
                // Include the satellite name in the data
                satInfo.name = name;
                satellites.push(satInfo);
            } catch (error) {
                //console.error(`Error parsing TLE (id: ${i}, name: ${name}): ${error.message ? error.message : error}`);
                fs.appendFileSync(ERR_LOG_FILE, `Error parsing TLE (id: ${i}, name: ${name}): ${error.message ? error.message : error}\n`);
            }
        }
  
        // Save parsed data to JSON file
        fs.writeFileSync('celestrak_tles.json', JSON.stringify(satellites, null, 2));
        console.log('Parsed Celestrak TLEs saved to celestrak_tles.json');

        db_updates['celestrak'] = Math.floor(new Date().now() / 1000);
    } catch (error) {
        console.error('Error fetching or parsing Celestrak TLEs:', error);
        fs.appendFileSync(ERR_LOG_FILE, `Error fetching or parsing Celestrak TLEs: ${error}\n`);
    }
}

const fetchAndParseSatNOGSTLEs = async() => {
    try {
        if (db_updates['satnogs'] && (Math.floor(new Date().now() / 1000) - db_updates['satnogs']) < 3600) {
            return console.log('SatNOGS TLEs already updated within the last hour');
        }

        let satellites = [];
        let url = 'https://db.satnogs.org/api/tle/?format=json'; // tle could be replaced by 'satellites', for example
  
        // Fetch all satellite pages
        const response = await axios.get(url);
        //console.log('SatNOGS API response: ', response.status, response.statusText);
        satellites = response.data;
        if (!satellites.length || !satellites[0]) {
            fs.appendFileSync(ERR_LOG_FILE, 'No SatNOGS satellites found\n');
            throw new Error('No SatNOGS satellites found');
        }

        // Save parsed data to JSON file
        fs.writeFileSync('satnogs_tles.json', JSON.stringify(satellites, null, 2));
  
        // Collect TLEs
        let tleData = '';
        for (const sat of satellites) {
            tleData += `${sat.tle0}\n${sat.tle1}\n${sat.tle2}\n`;
        }

        // Save data to a file
        fs.writeFileSync('satnogs_tles.txt', tleData);
        console.log('SatNOGS TLEs saved to satnogs_tles.txt');

        db_updates['satnogs'] = Math.floor(new Date().now() / 1000);
    } catch (error) {
        console.error('Error fetching SatNOGS TLEs:', error);
        fs.appendFileSync(ERR_LOG_FILE, `Error fetching SatNOGS TLEs: ${error}\n`);
    }
}

const fetchNORADTLEs = async() => {
    try {
        if (db_updates['norad'] && (Math.floor(new Date().now() / 1000) - db_updates['norad']) < 86400) {
            return console.log('NORAD TLEs already updated within the last day');
        }

        const USERNAME = process.env.SPACETRACK_USERNAME;
        const PASSWORD = process.env.SPACETRACK_PASSWORD;

        if (!USERNAME || !PASSWORD) {
            throw new Error('Please provide Space-Track.org credentials');
        }

        // First login - curl -c cookies.txt -b cookies.txt https://www.space-track.org/ajaxauth/login -d "identity=myusername&password=mY_S3cr3t_pA55w0rd!"
        const authConfig = {
            method: 'post',
            url: 'https://www.space-track.org/ajaxauth/login',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: `identity=${USERNAME}&password=${PASSWORD}`
        };
        const authResponse = await axios(authConfig);
        if (authResponse.status !== 200) {
            throw new Error(`Failed to authenticate with Space-Track.org. HTTP ${authResponse.status} / ${authResponse.statusText}`);
        }
        console.log('Authenticated with Space-Track.org...');
        // Get the cookies
        const cookies = authResponse.headers['set-cookie'];
        // Then fetch TLEs - curl -b cookies.txt https://www.space-track.org/basicspacedata/query/class/tle_latest/ORDINAL/1/NORAD_CAT_ID/>0/format/tle
        // Configure the request with cookies
        const cookieString = cookies.map(cookie => cookie.split(';')[0]).join('; ');
        const config = {
            method: 'get',
            url: 'https://www.space-track.org/basicspacedata/query/class/tle_latest/ORDINAL/1/NORAD_CAT_ID/>0/format/tle',
            headers: {
                Cookie: cookieString
            }
        };
        const response = await axios(config);
        if (response.status !== 200) {
            throw new Error(`Failed to fetch NORAD TLEs. HTTP ${response.status} / ${response.statusText}`);
        }
        const data = response.data;
  
        // Save data to a file
        fs.writeFileSync('norad_tles_raw.txt', data);
        //console.log('NORAD TLEs saved to norad_tles.txt');

        //const data = fs.readFileSync('norad_tles.txt', 'utf8');

        // Split the data into individual TLEs
        const tleLines = data.trim().split('\n');
        const satellites = [];

        const linesToSave = [];
        for (let i = 0; i < tleLines.length; i += 2) {
            const name = `NORAD_SAT_${Math.ceil(i / 2)}`;
            const line1 = tleLines[i].trim().replace(/ {2}(?=[A-Z])/g, '');
            const line2 = tleLines[i + 1].trim();
            linesToSave.push(`${name}\n${line1}\n${line2}`);
            // TLE parsing
            const tle = `${line1}\n${line2}`;
            try {
                const satInfo = tlejs.getSatelliteInfo(tle);
                satellites.push(satInfo);
            } catch (error) {
                //console.error(`Error parsing TLE (id: ${i}, name: ${name}): ${error.message ? error.message : error}`);
                fs.appendFileSync(ERR_LOG_FILE, `Error parsing TLE (line: ${i + 1}, name: ${name}): ${error.message ? error.message : error}\n`);
            }
        }

        // Save data to file
        fs.writeFileSync('norad_tles.txt', linesToSave.join('\n'));
        console.log('NORAD TLEs saved to norad_tles.txt');
  
        // Save parsed data to JSON file
        fs.writeFileSync('norad_tles.json', JSON.stringify(satellites, null, 2));
        console.log('Parsed NORAD TLEs saved to norad_tles.json');

        db_updates['norad'] = Math.floor(new Date().now() / 1000);
    } catch (error) {
        console.error('Error fetching NORAD TLEs:', error.response ? error.response.data : error.message);
        fs.appendFileSync(ERR_LOG_FILE, `Error fetching NORAD TLEs: ${error.response ? error.response.data : error.message}\n`);
    }
}

const main = async() => {
    if (!process.env.SPACETRACK_USERNAME || !process.env.SPACETRACK_PASSWORD) {
        return console.error('Please provide Space-Track.org credentials');
    }
    while (42) {
        // Repeat once per day
        try { await fetchNORADTLEs(); } catch (error) { console.error('Error:', error); }
        // Repeat once per hour
        try { await fetchAndParseCelesTrackTLEs(); } catch (error) { console.error('Error:', error); }
        // Repeat one per hour
        try { await fetchAndParseSatNOGSTLEs(); } catch (error) { console.error('Error:', error); }
        // TODO - Parse in Cassandra DB
        db_updates['latest'] = Math.floor(new Date().now() / 1000);
        // Wait for an hour
        console.log(`[${new Date().toISOString()}]: Waiting for an hour...`);
        await new Promise(resolve => setTimeout(resolve, 3600000));
    }
}

main().then().catch();
const fs = require('fs');
const satellite = require('satellite.js');

// TODO - replace the input tleFILE file with the actual TLE data from Cassandra DB
const estimOrbitByTLEs = async(tleFile, outputOrbitsFile = 'estim_orbits.json') => {
  try {
    const data = fs.readFileSync(tleFile, 'utf8');

    // Split the data into individual TLEs
    const tleLines = data.trim().split('\n');
    const satellites = [];

    for (let i = 0; i < tleLines.length; i += 3) {
      const name = tleLines[i].trim();
      const line1 = tleLines[i + 1].trim();
      const line2 = tleLines[i + 2].trim();

      // Parse the TLE lines into a satellite record
      const satrec = satellite.twoline2satrec(line1, line2);

      // Get the current time
      const now = new Date();

      // Propagate satellite using current time
      const positionAndVelocity = satellite.propagate(satrec, now);

      // Check if propagation was successful
      if (positionAndVelocity.position && positionAndVelocity.velocity) {
        // Get position and velocity in geodetic coordinates
        const positionGd = satellite.eciToGeodetic(
          positionAndVelocity.position,
          satellite.gstime(now)
        );

        // Get latitude, longitude, and altitude
        const latitude = satellite.degreesLat(positionGd.latitude);
        const longitude = satellite.degreesLong(positionGd.longitude);
        const altitude = positionGd.height; // in kilometers

        // Create an object with satellite information
        const satInfo = {
          name: name,
          latitude: latitude,
          longitude: longitude,
          altitude: altitude,
          // Add more fields as needed
        };

        satellites.push(satInfo);
      } else {
        console.warn(`Propagation failed for satellite: ${name}`);
      }
    }

    // Save parsed data to JSON file
    fs.writeFileSync(outputOrbitsFile, JSON.stringify(satellites, null, 2));
    console.log('Parsed NORAD TLEs saved to norad_tles.json');
  } catch (error) {
    console.error('Error fetching or parsing NORAD TLEs:', error);
  }
}

export default estimOrbitByTLEs;
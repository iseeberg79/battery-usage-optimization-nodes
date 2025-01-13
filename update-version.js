const fs = require('fs');
const packageJson = require('./package.json');

// Erzeuge eine neue Versionsnummer mit Zeitstempel
const date = new Date();
const timestamp = `${date.getFullYear()}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getDate().toString().padStart(2, '0')}-${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}${date.getSeconds().toString().padStart(2, '0')}`;

// Setze die neue Versionsnummer
const oldVersion = packageJson.version; 
const newVersion = `${oldVersion}-${timestamp}`;

// Schreibe die aktualisierte package.json zurück
fs.writeFileSync('./package.json', JSON.stringify(packageJson, null, 2));

console.log(`Version updated to ${packageJson.version}`);


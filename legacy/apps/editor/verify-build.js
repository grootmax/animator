const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'dist-electron/main.js',
  'dist-electron/preload.js',
  'dist/index.html'
];

let missing = false;

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(__dirname, file))) {
    console.error(`Missing required asset: ${file}`);
    missing = true;
  }
}

if (missing) {
  process.exit(1);
} else {
  console.log('All required Electron assets verified successfully.');
}

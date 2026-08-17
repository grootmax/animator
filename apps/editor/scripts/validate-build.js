const fs = require('fs');
const path = require('path');

const requiredFiles = [
  'dist/index.html',
  'dist-electron/main.js',
  'dist-electron/preload.js'
];

let allExist = true;

requiredFiles.forEach(file => {
  const fullPath = path.join(__dirname, '..', file);
  if (!fs.existsSync(fullPath)) {
    console.error(`Validation failed: Missing ${file}`);
    allExist = false;
  }
});

if (!allExist) {
  process.exit(1);
}

console.log('Build validation passed: All core components are present.');

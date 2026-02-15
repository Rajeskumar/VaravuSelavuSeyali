const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, 'assets');

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// Minimal 1x1 pixel PNG (Base64)
const dummyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const files = [
  'icon.png',
  'splash.png',
  'adaptive-icon.png',
  'favicon.png'
];

files.forEach(file => {
  const filePath = path.join(ASSETS_DIR, file);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, dummyPng);
    console.log(`Created dummy asset: ${file}`);
  }
});

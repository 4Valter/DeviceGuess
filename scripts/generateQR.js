const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SCAN_ID = process.env.SCAN_ID || `scan-${Date.now()}`;
const OUTPUT_DIR = path.join(__dirname, '../public');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'qr-code.png');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Generate QR code
const url = `${BASE_URL}/s/${SCAN_ID}`;

console.log('🔗 Generating QR code...');
console.log(`📱 URL: ${url}`);
console.log(`🆔 Scan ID: ${SCAN_ID}`);

QRCode.toFile(OUTPUT_FILE, url, {
  errorCorrectionLevel: 'M',
  type: 'png',
  width: 300,
  margin: 2,
  color: {
    dark: '#000000',
    light: '#FFFFFF'
  }
}, function (err) {
  if (err) {
    console.error('❌ Error generating QR code:', err);
    process.exit(1);
  }
  
  console.log(`✅ QR code generated successfully!`);
  console.log(`📄 Saved to: ${OUTPUT_FILE}`);
  console.log(`\n💡 Usage:`);
  console.log(`   1. Start the server: npm start`);
  console.log(`   2. Open ${OUTPUT_FILE} and scan with your device`);
  console.log(`   3. Check the database for collected data`);
});


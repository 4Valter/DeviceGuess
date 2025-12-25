const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CSV_FILE = path.join(__dirname, '..', 'modsumm_tac_imei.csv');
const DB_PATH = path.join(__dirname, '..', 'data', 'gsma.db');
const DATA_DIR = path.dirname(DB_PATH);

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Check if CSV file exists
if (!fs.existsSync(CSV_FILE)) {
  console.error(`❌ CSV file not found: ${CSV_FILE}`);
  process.exit(1);
}

console.log('🚀 Starting GSMA database import...');
console.log(`📄 CSV File: ${CSV_FILE}`);
console.log(`💾 Database: ${DB_PATH}`);

// Initialize database
const db = new Database(DB_PATH);

// Create table
db.exec(`
  DROP TABLE IF EXISTS devices
`);

db.exec(`
  CREATE TABLE devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tac_imei TEXT,
    standardised_full_name TEXT,
    standardised_manufacturer TEXT,
    device_type TEXT,
    operating_system TEXT,
    bands TEXT,
    lte TEXT,
    g5 TEXT,
    simslot TEXT,
    euicc TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create indexes
db.exec(`
  CREATE INDEX idx_full_name ON devices(standardised_full_name)
`);

db.exec(`
  CREATE INDEX idx_manufacturer ON devices(standardised_manufacturer)
`);

db.exec(`
  CREATE INDEX idx_full_name_lower ON devices(LOWER(standardised_full_name))
`);

// Prepare insert statement
const insertStmt = db.prepare(`
  INSERT INTO devices (
    tac_imei,
    standardised_full_name,
    standardised_manufacturer,
    device_type,
    operating_system,
    bands,
    lte,
    g5,
    simslot,
    euicc
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMany = db.transaction((devices) => {
  for (const device of devices) {
    insertStmt.run(
      device.tac_imei,
      device.standardised_full_name,
      device.standardised_manufacturer,
      device.device_type,
      device.operating_system,
      device.bands,
      device.lte,
      device.g5,
      device.simslot,
      device.euicc
    );
  }
});

// Read CSV file line by line
const fileStream = fs.createReadStream(CSV_FILE);
const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity
});

let lineNumber = 0;
let headers = [];
let batch = [];
const BATCH_SIZE = 1000;
let totalImported = 0;

rl.on('line', (line) => {
  lineNumber++;
  
  // Skip empty lines
  if (!line.trim()) {
    return;
  }
  
  // Parse header
  if (lineNumber === 1) {
    headers = line.split('|').map(h => h.trim().toLowerCase());
    console.log(`📋 Headers found: ${headers.length} columns`);
    return;
  }
  
  // Parse data line (pipe-separated)
  const values = line.split('|').map(v => v.trim());
  
  // Skip invalid lines
  if (values.length !== headers.length) {
    return;
  }
  
  // Create device object
  const device = {
    tac_imei: values[headers.indexOf('tac_imei')] || null,
    standardised_full_name: values[headers.indexOf('standardisedfullname')] || null,
    standardised_manufacturer: values[headers.indexOf('standardisedmanufacturer')] || null,
    device_type: values[headers.indexOf('devicetype')] || null,
    operating_system: values[headers.indexOf('operatingsystem')] || null,
    bands: values[headers.indexOf('bands')] || null,
    lte: values[headers.indexOf('lte')] || null,
    g5: values[headers.indexOf('5g')] || null,
    simslot: values[headers.indexOf('simslot')] || null,
    euicc: values[headers.indexOf('euicc')] || null
  };
  
  // Skip entries with "Not in Signaling" or invalid data
  if (device.standardised_full_name === 'Not in Signaling' || 
      !device.standardised_full_name ||
      device.standardised_full_name === 'Not Known') {
    return;
  }
  
  batch.push(device);
  
  // Insert batch when it reaches BATCH_SIZE
  if (batch.length >= BATCH_SIZE) {
    insertMany(batch);
    totalImported += batch.length;
    console.log(`✅ Imported ${totalImported} devices...`);
    batch = [];
  }
});

rl.on('close', () => {
  // Insert remaining devices
  if (batch.length > 0) {
    insertMany(batch);
    totalImported += batch.length;
  }
  
  console.log(`\n✅ Import completed!`);
  console.log(`📊 Total devices imported: ${totalImported}`);
  
  // Get final count
  const count = db.prepare('SELECT COUNT(*) as count FROM devices').get();
  console.log(`📈 Database contains ${count.count} devices`);
  
  db.close();
  process.exit(0);
});

rl.on('error', (error) => {
  console.error('❌ Error reading CSV file:', error);
  db.close();
  process.exit(1);
});


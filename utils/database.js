const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data', 'devices.db');
const DATA_DIR = path.dirname(DB_PATH);

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = null;

/**
 * Initialize the SQLite database
 */
function initDatabase() {
  try {
    db = new Database(DB_PATH);
    
    // Create devices table
    db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        os TEXT,
        os_version TEXT,
        browser TEXT,
        browser_version TEXT,
        device_brand TEXT,
        device_model TEXT,
        device_type TEXT,
        screen_width INTEGER,
        screen_height INTEGER,
        pixel_ratio REAL,
        gpu_renderer TEXT,
        battery_level REAL,
        battery_charging INTEGER,
        redirect_url TEXT,
        client_hints TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create index on scan_id for faster lookups
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_scan_id ON devices(scan_id)
    `);
    
    // Create index on timestamp for time-based queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_timestamp ON devices(timestamp)
    `);
    
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
}

/**
 * Log device data to the database
 */
function logDeviceData(data) {
  if (!db) {
    throw new Error('Database not initialized');
  }
  
  try {
    const stmt = db.prepare(`
      INSERT INTO devices (
        scan_id, timestamp, ip_address, user_agent,
        os, os_version, browser, browser_version,
        device_brand, device_model, device_type,
        screen_width, screen_height, pixel_ratio,
        gpu_renderer, battery_level, battery_charging,
        redirect_url, client_hints
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const clientHintsJson = data.clientHints ? JSON.stringify(data.clientHints) : null;
    
    stmt.run(
      data.scanId,
      data.timestamp,
      data.ip,
      data.userAgent,
      data.os,
      data.osVersion,
      data.browser,
      data.browserVersion,
      data.deviceBrand,
      data.deviceModel,
      data.deviceType,
      data.screenWidth,
      data.screenHeight,
      data.pixelRatio,
      data.gpuRenderer,
      data.batteryLevel,
      data.batteryCharging ? 1 : 0,
      data.redirectUrl,
      clientHintsJson
    );
    
    console.log(`📊 Logged device data for scan ID: ${data.scanId}`);
  } catch (error) {
    console.error('❌ Error logging device data:', error);
    throw error;
  }
}

/**
 * Get all device records
 */
function getAllDevices() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  
  return db.prepare('SELECT * FROM devices ORDER BY created_at DESC').all();
}

/**
 * Get device records by scan ID
 */
function getDevicesByScanId(scanId) {
  if (!db) {
    throw new Error('Database not initialized');
  }
  
  return db.prepare('SELECT * FROM devices WHERE scan_id = ? ORDER BY created_at DESC').all(scanId);
}

/**
 * Close database connection
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDatabase,
  logDeviceData,
  getAllDevices,
  getDevicesByScanId,
  closeDatabase
};


const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data', 'gsma.db');
const DATA_DIR = path.dirname(DB_PATH);

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = null;

/**
 * Initialize the GSMA database
 */
function initDatabase() {
  try {
    // Check if database file exists
    if (!fs.existsSync(DB_PATH)) {
      console.warn(`⚠️  GSMA database file not found at: ${DB_PATH}`);
      console.warn(`⚠️  Please run: npm run import-gsma to import the CSV data`);
      return false;
    }
    
    db = new Database(DB_PATH);
    
    // Create devices table (if not exists)
    db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
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
    
    // Create indexes for fast searching
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_full_name ON devices(standardised_full_name)
    `);
    
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_manufacturer ON devices(standardised_manufacturer)
    `);
    
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_full_name_lower ON devices(LOWER(standardised_full_name))
    `);
    
    // Verify database has data
    const count = db.prepare('SELECT COUNT(*) as count FROM devices').get();
    if (count.count === 0) {
      console.warn(`⚠️  GSMA database is empty! Please run: npm run import-gsma`);
      return false;
    }
    
    console.log(`✅ GSMA Database initialized: ${count.count} devices loaded`);
    return true;
  } catch (error) {
    console.error('❌ Error initializing GSMA database:', error);
    return false;
  }
}

/**
 * Search device by Marketing Name or Model Name
 * @param {string} searchTerm - The device name to search for
 * @returns {Object|null} Device information or null if not found
 */
function searchDevice(searchTerm) {
  // Ensure database is initialized
  if (!db) {
    const initResult = initDatabase();
    if (!initResult || !db) {
      // Database not available, return null gracefully
      return null;
    }
  }
  
  if (!searchTerm || searchTerm.trim() === '') {
    return null;
  }
  
  try {
    const cleanTerm = searchTerm.trim();
    
    // Try exact match first (case-insensitive)
    let stmt = db.prepare(`
      SELECT * FROM devices 
      WHERE LOWER(standardised_full_name) = LOWER(?)
      LIMIT 1
    `);
    
    let result = stmt.get(cleanTerm);
    
    // If no exact match, try partial match
    if (!result) {
      stmt = db.prepare(`
        SELECT * FROM devices 
        WHERE LOWER(standardised_full_name) LIKE LOWER(?)
        LIMIT 1
      `);
      result = stmt.get(`%${cleanTerm}%`);
    }
    
    // If still no match, try searching in reverse (if searchTerm contains the model)
    if (!result && cleanTerm.length > 3) {
      const words = cleanTerm.split(/\s+/).filter(w => w.length > 2);
      for (const word of words) {
        stmt = db.prepare(`
          SELECT * FROM devices 
          WHERE LOWER(standardised_full_name) LIKE LOWER(?)
          LIMIT 1
        `);
        result = stmt.get(`%${word}%`);
        if (result) break;
      }
    }
    
    return result || null;
  } catch (error) {
    console.error('Error searching device:', error);
    return null;
  }
}

/**
 * Advanced device matching using screen resolution and GPU
 * @param {Object} params - Matching parameters
 * @param {string} params.brand - Device brand
 * @param {string} params.model - Device model
 * @param {number} params.screenWidth - Screen width
 * @param {number} params.screenHeight - Screen height
 * @param {string} params.gpuRenderer - GPU renderer string
 * @returns {Object|null} Best matching device or null
 */
function advancedDeviceMatch(params) {
  // Ensure database is initialized
  if (!db) {
    const initResult = initDatabase();
    if (!initResult || !db) {
      // Database not available, return null gracefully
      return null;
    }
  }
  
  const { brand, model, screenWidth, screenHeight, gpuRenderer } = params;
  
  try {
    let candidates = [];
    
    // Step 1: Try to find by brand + model
    if (brand && model) {
      const searchTerm = `${brand} ${model}`.trim();
      let stmt = db.prepare(`
        SELECT * FROM devices 
        WHERE LOWER(standardised_full_name) LIKE LOWER(?)
        LIMIT 20
      `);
      candidates = stmt.all(`%${searchTerm}%`);
    }
    
    // Step 2: If no candidates, try with just model
    if (candidates.length === 0 && model) {
      let stmt = db.prepare(`
        SELECT * FROM devices 
        WHERE LOWER(standardised_full_name) LIKE LOWER(?)
        LIMIT 20
      `);
      candidates = stmt.all(`%${model}%`);
    }
    
    // Step 3: If we have candidates, try to narrow down using screen resolution
    // For now, we'll return the first match (can be enhanced with resolution matching)
    if (candidates.length > 0) {
      return candidates[0];
    }
    
    return null;
  } catch (error) {
    console.error('Error in advanced device match:', error);
    return null;
  }
}

/**
 * Search multiple devices (for debugging/analysis)
 * @param {string} searchTerm - The device name to search for
 * @param {number} limit - Maximum number of results
 * @returns {Array} Array of device information
 */
function searchDevices(searchTerm, limit = 10) {
  // Ensure database is initialized
  if (!db) {
    const initResult = initDatabase();
    if (!initResult || !db) {
      // Database not available, return empty array gracefully
      return [];
    }
  }
  
  if (!searchTerm || searchTerm.trim() === '') {
    return [];
  }
  
  try {
    const cleanTerm = searchTerm.trim();
    const stmt = db.prepare(`
      SELECT * FROM devices 
      WHERE LOWER(standardised_full_name) LIKE LOWER(?)
      LIMIT ?
    `);
    
    return stmt.all(`%${cleanTerm}%`, limit);
  } catch (error) {
    console.error('Error searching devices:', error);
    return [];
  }
}

/**
 * Get database statistics
 */
function getStats() {
  // Ensure database is initialized
  if (!db) {
    const initResult = initDatabase();
    if (!initResult || !db) {
      // Database not available, return zero stats
      return { totalDevices: 0, databasePath: DB_PATH };
    }
  }
  
  try {
    const count = db.prepare('SELECT COUNT(*) as count FROM devices').get();
    return {
      totalDevices: count.count,
      databasePath: DB_PATH
    };
  } catch (error) {
    console.error('Error getting stats:', error);
    return { totalDevices: 0, databasePath: DB_PATH };
  }
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
  searchDevice,
  searchDevices,
  advancedDeviceMatch,
  getStats,
  closeDatabase,
  DB_PATH
};


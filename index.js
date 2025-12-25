const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const QRCode = require('qrcode');
const DeviceDetector = require('device-detector-js');
const { initDatabase: initGSMADatabase, searchDevice: searchGSMADevice, advancedDeviceMatch, DB_PATH: GSMA_DB_PATH } = require('./utils/gsmaDatabase');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || '/data';
const SCANS_FILE = path.join(DATA_DIR, 'scans.json');
const DEFAULT_REDIRECT_URL = 'https://www.google.com';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize scans.json if it doesn't exist
if (!fs.existsSync(SCANS_FILE)) {
  fs.writeFileSync(SCANS_FILE, JSON.stringify([], null, 2));
}

// Device detector instance
const deviceDetector = new DeviceDetector();

// Initialize GSMA database at startup
console.log('🔍 Initializing GSMA database...');

// Check if database exists, if not and in production, try to import
if (!fs.existsSync(GSMA_DB_PATH)) {
  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️  GSMA database not found in production mode');
    console.warn('⚠️  Attempting automatic import...');
    
    // Try to run import (non-blocking, async)
    const importProcess = spawn('node', [path.join(__dirname, 'scripts', 'importGSMA.js')], {
      stdio: 'inherit',
      cwd: __dirname
    });
    
    importProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Automatic GSMA import completed successfully');
        // Re-initialize database after import
        initGSMADatabase();
      } else {
        console.error('❌ Automatic GSMA import failed');
        console.error('⚠️  Please run manually: npm run import-gsma');
        console.error('⚠️  Device matching will not work until database is imported');
      }
    });
    
    importProcess.on('error', (error) => {
      console.error('❌ Error running automatic import:', error.message);
      console.error('⚠️  Please run manually: npm run import-gsma');
      console.error('⚠️  Device matching will not work until database is imported');
    });
  } else {
    console.warn(`⚠️  GSMA database file not found at: ${GSMA_DB_PATH}`);
    console.warn(`⚠️  Please run: npm run import-gsma to import the CSV data`);
    console.warn(`⚠️  Device matching will not work until database is imported`);
  }
}

const gsmaInitResult = initGSMADatabase();
if (gsmaInitResult) {
  const { getStats } = require('./utils/gsmaDatabase');
  const stats = getStats();
  console.log(`✅ GSMA Database ready: ${stats.totalDevices} devices loaded`);
} else {
  console.warn('⚠️  GSMA Database initialization failed - matching may not work');
  console.warn('⚠️  The app will continue to run, but device matching will return null');
}

/**
 * Get client IP address from request
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         'Unknown';
}

/**
 * Get Client Hints from request headers
 */
function getClientHints(req) {
  const hints = {
    viewportWidth: req.headers['viewport-width'],
    deviceMemory: req.headers['device-memory'],
    dpr: req.headers['dpr'],
    width: req.headers['width'],
    ect: req.headers['ect'],
    rtt: req.headers['rtt'],
    downlink: req.headers['downlink']
  };
  
  // Remove undefined values
  Object.keys(hints).forEach(key => {
    if (hints[key] === undefined) {
      delete hints[key];
    }
  });
  
  return Object.keys(hints).length > 0 ? hints : null;
}

/**
 * Top 50 eSIM-compatible devices (fallback when database is unavailable)
 * Format: { deviceName: { euicc: true/false, manufacturer: string } }
 */
const TOP_ESIM_DEVICES = {
  'iPhone 12': { euicc: true, manufacturer: 'Apple' },
  'iPhone 13': { euicc: true, manufacturer: 'Apple' },
  'iPhone 14': { euicc: true, manufacturer: 'Apple' },
  'iPhone 15': { euicc: true, manufacturer: 'Apple' },
  'iPhone 16': { euicc: true, manufacturer: 'Apple' },
  'iPhone XS': { euicc: true, manufacturer: 'Apple' },
  'iPhone XR': { euicc: true, manufacturer: 'Apple' },
  'iPhone 11': { euicc: true, manufacturer: 'Apple' },
  'Motorola Edge 50': { euicc: true, manufacturer: 'Motorola' },
  'Moto G84': { euicc: true, manufacturer: 'Motorola' },
  'Google Pixel 7': { euicc: true, manufacturer: 'Google' },
  'Google Pixel 7a': { euicc: true, manufacturer: 'Google' },
  'Google Pixel 8': { euicc: true, manufacturer: 'Google' },
  'Samsung Galaxy S23': { euicc: true, manufacturer: 'Samsung' },
  'Samsung Galaxy S24': { euicc: true, manufacturer: 'Samsung' },
  'Samsung Galaxy S25': { euicc: true, manufacturer: 'Samsung' },
  'OnePlus 11': { euicc: true, manufacturer: 'OnePlus' },
  'OnePlus 12': { euicc: true, manufacturer: 'OnePlus' }
};

/**
 * Fallback GSMA search using hardcoded list (when database unavailable)
 */
function searchGSMADeviceFallback(searchTerm) {
  if (!searchTerm) return null;
  
  const normalized = searchTerm.toLowerCase().trim();
  
  // Try exact match first
  for (const [deviceName, data] of Object.entries(TOP_ESIM_DEVICES)) {
    if (normalized === deviceName.toLowerCase()) {
      return {
        standardised_full_name: deviceName,
        standardised_manufacturer: data.manufacturer,
        euicc: data.euicc ? 'true' : 'false'
      };
    }
  }
  
  // Try partial match
  for (const [deviceName, data] of Object.entries(TOP_ESIM_DEVICES)) {
    if (normalized.includes(deviceName.toLowerCase()) || deviceName.toLowerCase().includes(normalized)) {
      return {
        standardised_full_name: deviceName,
        standardised_manufacturer: data.manufacturer,
        euicc: data.euicc ? 'true' : 'false'
      };
    }
  }
  
  return null;
}

/**
 * Try to refine iPhone model detection using GPU/performance hints
 * @param {string} gpuRenderer - GPU renderer string
 * @param {number} hardwareConcurrency - CPU cores
 * @param {Array} possibleModels - Array of possible iPhone models
 * @returns {string|null} Refined model or null if cannot distinguish
 */
function refineiPhoneModel(gpuRenderer, hardwareConcurrency, possibleModels) {
  if (!gpuRenderer || possibleModels.length <= 1) {
    return null; // Cannot refine if no GPU info or already unique
  }
  
  // Note: GPU-based refinement is limited as Apple uses similar GPUs across generations
  // This is a placeholder for future enhancements (WebGL benchmarks, API availability checks)
  // For now, we cannot reliably distinguish iPhone 12/13/14 via GPU alone
  
  return null; // Cannot distinguish, return null to use series name
}

/**
 * Android GPU & Resolution Fingerprinting Table
 * Maps GPU renderer + screen width to device series
 * @param {string} gpuRenderer - GPU renderer string
 * @param {number} screenWidth - Screen width in pixels
 * @param {number} screenHeight - Screen height in pixels
 * @returns {Object|null} Object with displayName and models array, or null
 */
function identifyAndroidByGPU(gpuRenderer, screenWidth, screenHeight) {
  if (!gpuRenderer || !screenWidth) {
    return null;
  }
  
  // Normalize GPU renderer string (case-insensitive, remove extra spaces)
  const normalizedGPU = gpuRenderer.trim().toLowerCase();
  
  // Android GPU fingerprinting table
  const androidFingerprints = [
    // Motorola Edge 50 / Moto G Series
    {
      gpu: 'adreno (tm) 710',
      width: 432,
      height: 984,
      displayName: 'Motorola Edge 50 / Moto G84 Series',
      models: ['Motorola Edge 50', 'Moto G84', 'Moto G84 5G']
    },
    // Google Pixel 7 / 7a Series
    {
      gpu: 'mali-g710',
      width: 412,
      height: 915,
      displayName: 'Google Pixel 7 / 7a Series',
      models: ['Google Pixel 7', 'Google Pixel 7a', 'Google Pixel 7 Pro']
    },
    // Samsung Galaxy S23 / S24 Series (Snapdragon)
    {
      gpu: 'adreno (tm) 740',
      width: 360,
      height: 780,
      displayName: 'Samsung Galaxy S23 / S24 Series',
      models: ['Samsung Galaxy S23', 'Samsung Galaxy S24', 'Samsung Galaxy S23 Ultra']
    },
    // OnePlus 11 / 12 Series
    {
      gpu: 'adreno (tm) 740',
      width: 412,
      height: 915,
      displayName: 'OnePlus 11 / 12 Series',
      models: ['OnePlus 11', 'OnePlus 12', 'OnePlus 11 Pro']
    }
  ];
  
  // Try to find match (allow ±2px tolerance for screen dimensions)
  for (const fingerprint of androidFingerprints) {
    if (normalizedGPU.includes(fingerprint.gpu.toLowerCase())) {
      const widthMatch = Math.abs(screenWidth - fingerprint.width) <= 2;
      const heightMatch = !fingerprint.height || Math.abs(screenHeight - fingerprint.height) <= 2;
      
      if (widthMatch && heightMatch) {
        console.log(`🤖 Android fingerprint match: ${fingerprint.displayName} (GPU: ${gpuRenderer}, Screen: ${screenWidth}x${screenHeight})`);
        return {
          displayName: fingerprint.displayName,
          models: fingerprint.models,
          isUnique: fingerprint.models.length === 1
        };
      }
    }
  }
  
  return null;
}

/**
 * iPhone Fingerprinting: Identify specific iPhone model(s) based on screen resolution and pixel ratio
 * @param {number} screenWidth - Screen width in pixels
 * @param {number} screenHeight - Screen height in pixels
 * @param {number} pixelRatio - Device pixel ratio
 * @param {string} gpuRenderer - GPU renderer string (optional, for refinement)
 * @param {number} hardwareConcurrency - CPU cores (optional, for refinement)
 * @returns {Object|null} Object with models array, isUnique flag, and displayName, or null
 */
function identifyiPhoneModel(screenWidth, screenHeight, pixelRatio, gpuRenderer = null, hardwareConcurrency = null) {
  if (!screenWidth || !screenHeight || !pixelRatio) {
    return null;
  }
  
  // Normalize pixel ratio (round to nearest integer for matching)
  const normalizedRatio = Math.round(pixelRatio);
  
  // iPhone resolution mapping
  const iphoneMap = [
    // Format: width x height @ratio: [models]
    { width: 390, height: 844, ratio: 3, models: ['iPhone 12', 'iPhone 13', 'iPhone 13 Pro', 'iPhone 14'] },
    { width: 428, height: 926, ratio: 3, models: ['iPhone 12 Pro Max', 'iPhone 13 Pro Max', 'iPhone 14 Plus'] },
    { width: 393, height: 852, ratio: 3, models: ['iPhone 14 Pro', 'iPhone 15', 'iPhone 15 Pro', 'iPhone 16'] },
    { width: 430, height: 932, ratio: 3, models: ['iPhone 14 Pro Max', 'iPhone 15 Plus', 'iPhone 15 Pro Max', 'iPhone 16 Plus'] },
    { width: 375, height: 812, ratio: 3, models: ['iPhone X', 'iPhone XS', 'iPhone 11 Pro'] },
    { width: 414, height: 896, ratio: 3, models: ['iPhone XR', 'iPhone 11', 'iPhone XS Max', 'iPhone 11 Pro Max'] }
  ];
  
  // Try to find exact match
  for (const entry of iphoneMap) {
    if (screenWidth === entry.width && screenHeight === entry.height && normalizedRatio === entry.ratio) {
      const possibleModels = [...entry.models];
      const isUnique = possibleModels.length === 1;
      
      // Try to refine using GPU/performance data
      let refinedModel = null;
      if (!isUnique && (gpuRenderer || hardwareConcurrency)) {
        refinedModel = refineiPhoneModel(gpuRenderer, hardwareConcurrency, possibleModels);
      }
      
      // Build display name
      let displayName;
      if (refinedModel) {
        displayName = refinedModel;
      } else if (isUnique) {
        displayName = possibleModels[0];
      } else {
        // Group models by series with better formatting
        // Extract numbers and variants (Pro, Max, Plus, etc.)
        const modelInfo = possibleModels.map(m => {
          const numMatch = m.match(/iPhone\s*(\d+)/);
          const variantMatch = m.match(/iPhone\s*\d+\s*(Pro|Max|Plus|Mini)?/i);
          return {
            number: numMatch ? parseInt(numMatch[1]) : null,
            variant: variantMatch ? variantMatch[1] : null,
            full: m
          };
        });
        
        const numbers = modelInfo.map(m => m.number).filter(n => n !== null).sort((a, b) => a - b);
        const variants = [...new Set(modelInfo.map(m => m.variant).filter(v => v))];
        
        if (numbers.length > 0) {
          const minNum = numbers[0];
          const maxNum = numbers[numbers.length - 1];
          
          // Build series name
          if (minNum === maxNum) {
            // Same number, different variants
            if (variants.length > 0) {
              const variantStr = variants.map(v => v || 'Standard').join(' & ');
              displayName = `iPhone ${minNum} ${variantStr} Series`;
            } else {
              displayName = `iPhone ${minNum} Series`;
            }
          } else {
            // Different numbers - format as "iPhone 12 / 13 / 14 Series" or "iPhone 12 / 13 / 14 Plus & Max Series"
            if (variants.length > 0) {
              // Group variants: if all have same variants, show them; otherwise show all variants
              const uniqueVariants = [...new Set(variants.filter(v => v))];
              if (uniqueVariants.length === 1) {
                displayName = `iPhone ${minNum} / ${maxNum} ${uniqueVariants[0]} Series`;
              } else if (uniqueVariants.length > 1) {
                const variantStr = uniqueVariants.join(' & ');
                displayName = `iPhone ${minNum} / ${maxNum} ${variantStr} Series`;
              } else {
                displayName = `iPhone ${minNum} / ${maxNum} Series`;
              }
            } else {
              displayName = `iPhone ${minNum} / ${maxNum} Series`;
            }
          }
        } else {
          // Fallback: join all models
          displayName = possibleModels.join(' / ') + ' Series';
        }
      }
      
      return {
        models: possibleModels,
        isUnique: isUnique || refinedModel !== null, // Unique if single model OR successfully refined
        displayName: displayName,
        refinedModel: refinedModel
      };
    }
  }
  
  return null;
}

/**
 * Check if iPhone model(s) support eSIM (fallback rule)
 * iPhone XS, XS Max, XR (released 2018) and later models support eSIM
 * @param {string|Array} iphoneModelOrModels - iPhone model name(s) (e.g., "iPhone 13" or ["iPhone 12", "iPhone 13"])
 * @returns {boolean} True if all models support eSIM
 */
function isiPhoneESIMCompatible(iphoneModelOrModels) {
  const models = Array.isArray(iphoneModelOrModels) ? iphoneModelOrModels : [iphoneModelOrModels];
  
  // Check if all models in the list are eSIM compatible
  for (const model of models) {
    if (!model || !model.toLowerCase().includes('iphone')) {
      continue; // Skip invalid models
    }
    
    // Extract number from model name
    const match = model.match(/iPhone\s*(?:XS|XR|X\s*S|X\s*R|(\d+))/i);
    if (!match) {
      continue;
    }
    
    // iPhone XS, XS Max, XR (2018) - eSIM compatible
    if (match[0].toLowerCase().includes('xs') || match[0].toLowerCase().includes('xr')) {
      continue; // Compatible, check next
    }
    
    // iPhone X (2017) - NOT eSIM compatible
    if (match[0].toLowerCase().includes('iphone x') && !match[0].toLowerCase().includes('xs') && !match[0].toLowerCase().includes('xr')) {
      return false; // Not compatible
    }
    
    // iPhone 11 and later (2019+) - eSIM compatible
    const number = parseInt(match[1]);
    if (number && number >= 11) {
      continue; // Compatible, check next
    }
    
    // iPhone 12, 13, 14, 15, 16 - all eSIM compatible
    if (number && number >= 12) {
      continue; // Compatible
    }
  }
  
  // All models checked, default to true for modern iPhones
  return true;
}

/**
 * Read scans from JSON file (always from disk, no caching)
 */
function readScans() {
  try {
    // Always read fresh from disk to avoid stale data
    const data = fs.readFileSync(SCANS_FILE, 'utf8');
    const scans = JSON.parse(data);
    console.log(`📖 Read ${scans.length} scan(s) from disk`);
    return scans;
  } catch (error) {
    console.error('Error reading scans.json:', error);
    return [];
  }
}

/**
 * Write scans to JSON file with atomic write
 */
function writeScans(scans) {
  try {
    // Use atomic write: write to temp file, then rename
    const tempFile = SCANS_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(scans, null, 2), 'utf8');
    fs.renameSync(tempFile, SCANS_FILE);
    console.log(`💾 Wrote ${scans.length} scan(s) to disk`);
    return true;
  } catch (error) {
    console.error('Error writing scans.json:', error);
    return false;
  }
}

/**
 * Update or create a scan by scanId
 * This ensures we update existing scans instead of creating duplicates
 */
function upsertScan(scanData) {
  const scans = readScans();
  const existingIndex = scans.findIndex(s => s.scanId === scanData.scanId);
  
  if (existingIndex >= 0) {
    // Update existing scan
    console.log(`🔄 Updating existing scan ID: ${scanData.scanId}`);
    scans[existingIndex] = scanData;
  } else {
    // Add new scan
    console.log(`➕ Adding new scan ID: ${scanData.scanId}`);
    scans.push(scanData);
  }
  
  return writeScans(scans);
}

/**
 * Get scan by ID (always reads fresh from disk)
 */
function getScanById(scanId) {
  const scans = readScans();
  const scan = scans.find(s => s.scanId === scanId);
  if (scan) {
    console.log(`🔍 Found scan ID: ${scanId}, Device: ${scan.deducedModel || scan.gsmaData?.standardisedFullName || 'Unknown'}`);
  } else {
    console.log(`❌ Scan ID not found: ${scanId}`);
  }
  return scan || null;
}

/**
 * Home route
 */
app.get('/', (req, res) => {
  res.render('home');
});

/**
 * Generate a truly unique scan ID
 */
function generateUniqueScanId() {
  // High-precision timestamp + random string for uniqueness
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 11); // 9 random chars
  return `scan-${timestamp}-${random}`;
}

/**
 * Generate QR code route
 */
app.get('/generate', async (req, res) => {
  try {
    // Always generate a new unique scanId (ignore query param to prevent collisions)
    const scanId = generateUniqueScanId();
    const url = `${BASE_URL}/s/${scanId}`;
    
    // Generate QR code as data URL (larger size for better scanning)
    const qrDataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'H', // High error correction for better reliability
      type: 'image/png',
      width: 500, // Larger size for easy scanning
      margin: 4,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
    // Render HTML page with QR code
    res.render('generate', {
      scanId: scanId,
      url: url,
      qrCode: qrDataUrl
    });
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).send(`
      <html>
        <head><title>Error</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>Error</h1>
          <p>Failed to generate QR code: ${error.message}</p>
        </body>
      </html>
    `);
  }
});

/**
 * Redirection route: /s/:id
 */
app.get('/s/:id', (req, res) => {
  const { id } = req.params;
  
  // Set cache headers to prevent browser caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  console.log(`\n📱 Scan initiated for ID: ${id}`);
  
  const userAgent = req.headers['user-agent'] || '';
  
  // Parse User-Agent using device-detector-js
  const deviceInfo = deviceDetector.parse(userAgent);
  
  // Capture server-side data
  const serverData = {
    ip: getClientIP(req),
    userAgent: userAgent,
    os: deviceInfo.os?.name || null,
    osVersion: deviceInfo.os?.version || null,
    browser: deviceInfo.client?.name || null,
    browserVersion: deviceInfo.client?.version || null,
    deviceBrand: deviceInfo.device?.brand || null,
    deviceModel: deviceInfo.device?.model || null,
    deviceType: deviceInfo.device?.type || null,
    clientHints: getClientHints(req),
    timestamp: new Date().toISOString()
  };
  
  console.log(`📊 Server-side data captured - Brand: ${serverData.deviceBrand}, Model: ${serverData.deviceModel}, OS: ${serverData.os}`);
  
  // Render the collector page with server data
  res.render('collector', {
    scanId: id,
    serverData: serverData,
    redirectUrl: req.query.redirect || DEFAULT_REDIRECT_URL
  });
});

/**
 * Logging route: /log/:id (POST)
 */
app.post('/log/:id', (req, res) => {
  const { id } = req.params;
  const clientData = req.body;
  
  // Set cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  try {
    console.log(`\n🔍 Starting device matching for scan ID: ${id}`);
    console.log(`📋 Received client data - Screen: ${clientData.screenWidth}x${clientData.screenHeight}, GPU: ${clientData.gpuRenderer ? 'Yes' : 'No'}`);
    console.log(`📱 Device Brand: ${clientData.serverData?.deviceBrand || 'N/A'}`);
    console.log(`📱 Device Model: ${clientData.serverData?.deviceModel || 'N/A'}`);
    console.log(`📺 Screen: ${clientData.screenWidth || 'N/A'}x${clientData.screenHeight || 'N/A'}`);
    console.log(`📐 Pixel Ratio: ${clientData.pixelRatio || 'N/A'}`);
    console.log(`🎮 GPU: ${clientData.gpuRenderer ? clientData.gpuRenderer.substring(0, 50) : 'N/A'}`);
    
    // Advanced device matching using multiple data points
    let gsmaData = null;
    let matchConfidence = 0;
    let deducedModel = null;
    let eSIMFallback = null;
    
    const deviceModel = clientData.serverData?.deviceModel;
    const deviceBrand = clientData.serverData?.deviceBrand;
    const screenWidth = clientData.screenWidth;
    const screenHeight = clientData.screenHeight;
    const pixelRatio = clientData.pixelRatio;
    const gpuRenderer = clientData.gpuRenderer;
    
    // Priority 1: Client Hints (if available from client-side)
    const clientHintsModel = clientData.clientHintsData?.model;
    const clientHintsBrand = clientData.clientHintsData?.brand;
    
    // Priority 2: Android GPU Fingerprinting (if brand/model is null/masked)
    let androidFingerprint = null;
    if ((!deviceBrand || !deviceModel || deviceModel === 'K') && gpuRenderer && screenWidth) {
      console.log(`🤖 Device brand/model masked or null, attempting Android GPU fingerprinting...`);
      androidFingerprint = identifyAndroidByGPU(gpuRenderer, screenWidth, screenHeight);
      
      if (androidFingerprint) {
        deducedModel = androidFingerprint.displayName;
        console.log(`✅ Android fingerprinting result: ${deducedModel}`);
        
        // Try to find GSMA match for each possible model
        let foundMatch = false;
        for (const model of androidFingerprint.models) {
          console.log(`[Matching] Input: ${model}`);
          const result = searchGSMADevice(model);
          
          if (result) {
            gsmaData = result;
            foundMatch = true;
            console.log(`[Matching] Result: ${gsmaData.standardised_full_name} | eSIM: ${gsmaData.euicc}`);
            break; // Use first match found
          }
        }
        
        if (foundMatch) {
          matchConfidence = androidFingerprint.isUnique ? 100 : 50;
          console.log(`✅ GSMA match found with confidence: ${matchConfidence}%`);
        } else {
          console.log(`❌ No GSMA match found for Android fingerprint`);
          matchConfidence = 50; // Medium confidence for fingerprint match without GSMA
        }
      }
    }
    
    // Priority 3: iPhone Fingerprinting: If device is Apple/iPhone, use resolution-based identification
    let iphoneFingerprint = null;
    let gsmaMatches = []; // Declare outside block for later use in eSIM determination
    if (!androidFingerprint && (deviceBrand && deviceBrand.toLowerCase().includes('apple') || 
        deviceModel && deviceModel.toLowerCase().includes('iphone'))) {
      console.log(`🍎 Detected Apple device, attempting iPhone fingerprinting...`);
      iphoneFingerprint = identifyiPhoneModel(screenWidth, screenHeight, pixelRatio, gpuRenderer, clientData.hardwareConcurrency);
      
      if (iphoneFingerprint) {
        deducedModel = iphoneFingerprint.displayName;
        
        console.log(`✅ iPhone fingerprinting result: ${deducedModel} (${iphoneFingerprint.models.length} possible model(s))`);
        
        // Try to find GSMA match for each possible model
        // Collect all matches to verify eSIM compatibility across all models
        let foundMatch = false;
        gsmaMatches = [];
        
        for (const model of iphoneFingerprint.models) {
          console.log(`[Matching] Input: ${model}`);
          let result = searchGSMADevice(model);
          
          // Fallback to hardcoded list if database unavailable
          if (!result) {
            console.log(`⚠️  Database search failed, trying fallback list...`);
            result = searchGSMADeviceFallback(model);
          }
          
          if (result) {
            gsmaMatches.push(result);
            if (!foundMatch) {
              // Use first match as primary result (for admin view)
              gsmaData = result;
              foundMatch = true;
            }
            console.log(`[Matching] Result: ${result.standardised_full_name} | eSIM: ${result.euicc}`);
          }
        }
        
        if (foundMatch) {
          // Verify eSIM compatibility across all matches
          // If all matches agree on eUICC status, use that; otherwise use fallback
          const euiccValues = gsmaMatches.map(m => m.euicc === 'true' || m.euicc === true);
          const allAgree = euiccValues.length > 0 && euiccValues.every(v => v === euiccValues[0]);
          
          if (allAgree && gsmaMatches.length === iphoneFingerprint.models.length) {
            // All models matched and agree on eSIM status
            console.log(`✅ All ${gsmaMatches.length} model(s) matched in GSMA with consistent eSIM status: ${euiccValues[0]}`);
          } else if (gsmaMatches.length < iphoneFingerprint.models.length) {
            // Some models didn't match, use fallback for missing ones
            console.log(`⚠️  Only ${gsmaMatches.length}/${iphoneFingerprint.models.length} model(s) matched in GSMA`);
            eSIMFallback = isiPhoneESIMCompatible(iphoneFingerprint.models);
            console.log(`📱 Applying iPhone eSIM fallback rule for unmatched models: ${eSIMFallback ? 'YES' : 'NO'}`);
          }
          
          // Confidence: 100% if unique match OR successfully refined, 50% if multiple models share resolution
          matchConfidence = iphoneFingerprint.isUnique ? 100 : 50;
          console.log(`✅ GSMA match found with confidence: ${matchConfidence}% (${iphoneFingerprint.isUnique ? 'unique' : 'multiple models possible'})`);
        } else {
          console.log(`❌ No GSMA match found for any deduced model`);
          // Apply fallback rule for iPhone eSIM compatibility
          eSIMFallback = isiPhoneESIMCompatible(iphoneFingerprint.models);
          console.log(`📱 Applying iPhone eSIM fallback rule for ${iphoneFingerprint.models.length} model(s): ${eSIMFallback ? 'YES' : 'NO'}`);
          // Confidence: 50% when using fallback (multiple models possible)
          matchConfidence = 50;
        }
      } else {
        console.log(`⚠️  Could not deduce iPhone model from resolution (${screenWidth}x${screenHeight}@${pixelRatio}x)`);
      }
    }
    
    // Step A: Use Client Hints if available (highest priority, bypasses masked User-Agent)
    if (!gsmaData && !androidFingerprint && !iphoneFingerprint && clientHintsModel) {
      console.log(`🔍 Attempting GSMA match with Client Hints model: ${clientHintsModel}`);
      const searchTerm = clientHintsBrand ? `${clientHintsBrand} ${clientHintsModel}` : clientHintsModel;
      gsmaData = searchGSMADevice(searchTerm);
      
      // Fallback to hardcoded list if database unavailable
      if (!gsmaData) {
        console.log(`⚠️  Database search failed, trying fallback list...`);
        gsmaData = searchGSMADeviceFallback(searchTerm);
      }
      
      if (gsmaData) {
        deducedModel = gsmaData.standardised_full_name;
        matchConfidence = 90; // High confidence for Client Hints
        console.log(`✅ Client Hints match found: ${gsmaData.standardised_full_name} | eSIM: ${gsmaData.euicc}`);
      } else {
        // Try with just the model name
        gsmaData = searchGSMADevice(clientHintsModel);
        if (!gsmaData) {
          gsmaData = searchGSMADeviceFallback(clientHintsModel);
        }
        if (gsmaData) {
          deducedModel = gsmaData.standardised_full_name;
          matchConfidence = 85;
          console.log(`✅ Client Hints match found (model only): ${gsmaData.standardised_full_name} | eSIM: ${gsmaData.euicc}`);
        }
      }
    }
    
    // Step B: Parse User-Agent to get primary brand/model hint
    // Step C: Use advanced matching with screen resolution and GPU (if not iPhone/Android fingerprint)
    if (!gsmaData && !androidFingerprint && !iphoneFingerprint && (deviceBrand || deviceModel)) {
      console.log(`🔎 Attempting advanced matching with brand/model...`);
      gsmaData = advancedDeviceMatch({
        brand: deviceBrand,
        model: deviceModel,
        screenWidth: screenWidth,
        screenHeight: screenHeight,
        gpuRenderer: gpuRenderer
      });
      
      if (gsmaData) {
        matchConfidence = 85; // High confidence for advanced match
        console.log(`✅ Advanced match found: ${gsmaData.standardised_full_name}`);
        console.log(`[Matching] Input: ${deviceBrand} ${deviceModel} | Result: ${gsmaData.standardised_full_name} | eSIM: ${gsmaData.euicc}`);
      } else {
        console.log(`❌ Advanced matching failed, trying simple search...`);
      }
    }
    
    // Step C: Fallback to simple search if advanced matching didn't work
    if (!gsmaData) {
      let searchTerm = null;
      if (deviceBrand && deviceModel) {
        searchTerm = `${deviceBrand} ${deviceModel}`.trim();
      } else if (deviceModel) {
        searchTerm = deviceModel;
      } else if (deviceBrand) {
        searchTerm = deviceBrand;
      }
      
      if (searchTerm) {
        console.log(`🔎 Searching for: "${searchTerm}"`);
        gsmaData = searchGSMADevice(searchTerm);
        
        if (gsmaData) {
          matchConfidence = 70; // Medium confidence for simple match
          console.log(`✅ Simple match found: ${gsmaData.standardised_full_name}`);
          console.log(`[Matching] Input: ${searchTerm} | Result: ${gsmaData.standardised_full_name} | eSIM: ${gsmaData.euicc}`);
        } else {
          console.log(`❌ No match found for: "${searchTerm}"`);
          
          // If not found, try with just the model name
          if (deviceModel) {
            console.log(`🔎 Trying with model only: "${deviceModel}"`);
            gsmaData = searchGSMADevice(deviceModel);
            if (gsmaData) {
              matchConfidence = 50; // Lower confidence for model-only match
              console.log(`✅ Model-only match found: ${gsmaData.standardised_full_name}`);
              console.log(`[Matching] Input: ${deviceModel} | Result: ${gsmaData.standardised_full_name} | eSIM: ${gsmaData.euicc}`);
            } else {
              console.log(`❌ No match found for model: "${deviceModel}"`);
            }
          }
        }
      } else {
        console.log(`⚠️  No search term available (brand: ${deviceBrand}, model: ${deviceModel})`);
      }
    }
    
    // Final eSIM status determination
    // Priority: GSMA matches (if all agree) > Fallback rule > Single GSMA match
    let finalESIMStatus = null;
    
    if (iphoneFingerprint && gsmaMatches && gsmaMatches.length > 0) {
      // For iPhone with multiple possible models, check if all GSMA matches agree
      const euiccValues = gsmaMatches.map(m => m.euicc === 'true' || m.euicc === true);
      const allAgree = euiccValues.length > 0 && euiccValues.every(v => v === euiccValues[0]);
      
      if (allAgree && gsmaMatches.length === iphoneFingerprint.models.length) {
        // All models matched and agree on eSIM status
        finalESIMStatus = euiccValues[0];
        console.log(`📊 eUICC (eSIM) status from GSMA (all ${gsmaMatches.length} models agree): ${finalESIMStatus ? 'YES' : 'NO'}`);
      } else if (allAgree && gsmaMatches.length > 0) {
        // Some models matched and all agree
        finalESIMStatus = euiccValues[0];
        console.log(`📊 eUICC (eSIM) status from GSMA (${gsmaMatches.length} matches agree): ${finalESIMStatus ? 'YES' : 'NO'}`);
      } else if (eSIMFallback !== null) {
        // Use fallback if matches don't agree
        finalESIMStatus = eSIMFallback;
        console.log(`📊 eUICC (eSIM) status from fallback rule (GSMA matches inconsistent): ${finalESIMStatus ? 'YES' : 'NO'}`);
      } else if (gsmaData) {
        // Fallback to single match
        finalESIMStatus = gsmaData.euicc === 'true' || gsmaData.euicc === true;
        console.log(`📊 eUICC (eSIM) status from GSMA (single match): ${finalESIMStatus ? 'YES' : 'NO'}`);
      }
    } else if (gsmaData) {
      // Single GSMA match (non-iPhone or unique iPhone)
      finalESIMStatus = gsmaData.euicc === 'true' || gsmaData.euicc === true;
      console.log(`📊 eUICC (eSIM) status from GSMA: ${finalESIMStatus ? 'YES' : 'NO'}`);
    } else if (eSIMFallback !== null) {
      // Use fallback rule
      finalESIMStatus = eSIMFallback;
      console.log(`📊 eUICC (eSIM) status from fallback rule: ${finalESIMStatus ? 'YES' : 'NO'}`);
    } else {
      console.log(`❌ No GSMA match found and no fallback rule applicable`);
    }
    
    // Merge server and client data
    const scanData = {
      scanId: id,
      timestamp: new Date().toISOString(),
      // Server-side data
      ip: clientData.serverData?.ip || null,
      userAgent: clientData.serverData?.userAgent || null,
      os: clientData.serverData?.os || null,
      osVersion: clientData.serverData?.osVersion || null,
      browser: clientData.serverData?.browser || null,
      browserVersion: clientData.serverData?.browserVersion || null,
      deviceBrand: clientData.serverData?.deviceBrand || null,
      deviceModel: clientData.serverData?.deviceModel || null,
      deviceType: clientData.serverData?.deviceType || null,
      clientHints: clientData.serverData?.clientHints || null,
      // Client-side data
      fullUserAgent: clientData.fullUserAgent || null,
      screenWidth: clientData.screenWidth || null,
      screenHeight: clientData.screenHeight || null,
      pixelRatio: clientData.pixelRatio || null,
      gpuRenderer: clientData.gpuRenderer || null,
      gpuVendor: clientData.gpuVendor || null,
      hardwareConcurrency: clientData.hardwareConcurrency || null,
      batteryLevel: clientData.batteryLevel !== undefined ? clientData.batteryLevel : null,
      batteryCharging: clientData.batteryCharging !== undefined ? clientData.batteryCharging : null,
      redirectUrl: clientData.redirectUrl || DEFAULT_REDIRECT_URL,
      // GSMA database enrichment
      gsmaData: gsmaData ? {
        standardisedFullName: gsmaData.standardised_full_name,
        standardisedManufacturer: gsmaData.standardised_manufacturer,
        deviceType: gsmaData.device_type,
        operatingSystem: gsmaData.operating_system,
        bands: gsmaData.bands,
        lte: gsmaData.lte,
        g5: gsmaData.g5,
        simslot: gsmaData.simslot,
        euicc: gsmaData.euicc // eSIM compatibility (true/false string)
      } : null,
      // Matching confidence score
      matchConfidence: matchConfidence,
      // Deduced model (for iPhone fingerprinting) - can be a single model or "Series"
      deducedModel: deducedModel,
      // iPhone fingerprinting details (if applicable)
      iphoneFingerprint: iphoneFingerprint ? {
        models: iphoneFingerprint.models,
        isUnique: iphoneFingerprint.isUnique,
        displayName: iphoneFingerprint.displayName
      } : null,
      // eSIM fallback status (if GSMA lookup failed but fallback rule applies)
      eSIMFallback: eSIMFallback !== null ? eSIMFallback : null,
      // Final eSIM status (from GSMA or fallback) - ALWAYS set if possible
      eSIMCompatible: finalESIMStatus !== null ? finalESIMStatus : (gsmaData ? (gsmaData.euicc === 'true' || gsmaData.euicc === true) : null),
      // Flag to indicate if match is based on resolution (not unique hardware ID)
      isResolutionBased: iphoneFingerprint ? !iphoneFingerprint.isUnique : false
    };
    
    // Upsert scan (update if exists, create if new)
    // This ensures we always write to the correct scanId
    if (upsertScan(scanData)) {
      console.log(`✅ Logged device data for scan ID: ${id}`);
      console.log(`📊 Scan data - Device: ${deducedModel || deviceModel || 'Unknown'}, eSIM: ${scanData.eSIMCompatible}, GSMA: ${gsmaData ? 'Yes' : 'No'}`);
      res.json({
        success: true,
        scanId: id,
        redirectUrl: `/result/${id}`
      });
    } else {
      throw new Error('Failed to write to scans.json');
    }
  } catch (error) {
    console.error('Error logging device data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to log device data'
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

/**
 * Result page for a specific scan
 */
app.get('/result/:id', (req, res) => {
  const { id } = req.params;
  
  // Set cache headers to prevent browser caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  console.log(`\n🔍 Rendering Result for ID: ${id}`);
  
  // Always read fresh from disk (no caching)
  const scan = getScanById(id);
  
  if (!scan) {
    console.log(`❌ Scan ID not found: ${id}`);
    return res.status(404).send(`
      <html>
        <head><title>Scan Not Found</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>Scan Not Found</h1>
          <p>The scan ID "${id}" was not found.</p>
          <a href="/">Return to home</a>
        </body>
      </html>
    `);
  }
  
  // Log what we're rendering
  console.log(`✅ Rendering Result for ID: ${id}, Device: ${scan.deducedModel || scan.gsmaData?.standardisedFullName || scan.deviceModel || 'Unknown'}`);
  console.log(`📊 eSIM Compatible: ${scan.eSIMCompatible}, GSMA Data: ${scan.gsmaData ? 'Yes' : 'No'}`);
  
  // Use eSIMCompatible from scan data (already calculated and saved)
  // Don't recalculate - use what was saved
  const eSIMCompatible = scan.eSIMCompatible;
  
  res.render('result', {
    scan: scan,
    eSIMCompatible: eSIMCompatible,
    baseUrl: BASE_URL
  });
});

/**
 * View scans endpoint - HTML view with interesting fields
 */
app.get('/scans', (req, res) => {
  // Set cache headers
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Always read fresh from disk
  const scans = readScans();
  
  // If JSON format requested
  if (req.query.format === 'json') {
    return res.json({
      count: scans.length,
      scans: scans
    });
  }
  
  // Render HTML view with interesting fields highlighted
  res.render('scans', {
    scans: scans
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Device Intelligence Server running on port ${PORT}`);
  console.log(`📱 Generate QR code: ${BASE_URL}/generate`);
  console.log(`📊 View scans: ${BASE_URL}/scans`);
  console.log(`💾 Data directory: ${DATA_DIR}`);
});


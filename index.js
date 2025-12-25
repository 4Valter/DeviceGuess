const express = require('express');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const DeviceDetector = require('device-detector-js');

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
 * Read scans from JSON file
 */
function readScans() {
  try {
    const data = fs.readFileSync(SCANS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading scans.json:', error);
    return [];
  }
}

/**
 * Write scans to JSON file
 */
function writeScans(scans) {
  try {
    fs.writeFileSync(SCANS_FILE, JSON.stringify(scans, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing scans.json:', error);
    return false;
  }
}

/**
 * Generate QR code route
 */
app.get('/generate', async (req, res) => {
  try {
    const scanId = req.query.id || `scan-${Date.now()}`;
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
  
  try {
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
      screenWidth: clientData.screenWidth || null,
      screenHeight: clientData.screenHeight || null,
      pixelRatio: clientData.pixelRatio || null,
      gpuRenderer: clientData.gpuRenderer || null,
      gpuVendor: clientData.gpuVendor || null,
      batteryLevel: clientData.batteryLevel !== undefined ? clientData.batteryLevel : null,
      batteryCharging: clientData.batteryCharging !== undefined ? clientData.batteryCharging : null,
      redirectUrl: clientData.redirectUrl || DEFAULT_REDIRECT_URL
    };
    
    // Read existing scans
    const scans = readScans();
    
    // Add new scan
    scans.push(scanData);
    
    // Write back to file
    if (writeScans(scans)) {
      console.log(`✅ Logged device data for scan ID: ${id}`);
      res.json({
        success: true,
        redirectUrl: scanData.redirectUrl
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
  res.json({ status: 'ok' });
});

/**
 * View scans endpoint (optional, for debugging)
 */
app.get('/scans', (req, res) => {
  const scans = readScans();
  res.json({
    count: scans.length,
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


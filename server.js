const express = require('express');
const path = require('path');
const DeviceDetector = require('device-detector-js');
const { initDatabase, logDeviceData } = require('./utils/database');
const { captureServerData } = require('./utils/dataCapture');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize database
initDatabase();

// Device detector instance
const deviceDetector = new DeviceDetector();

// Redirection endpoint: /s/:id
app.get('/s/:id', (req, res) => {
  const { id } = req.params;
  
  // Capture server-side data
  const serverData = captureServerData(req);
  
  // Parse User-Agent
  const userAgent = req.headers['user-agent'] || '';
  const deviceInfo = deviceDetector.parse(userAgent);
  
  // Store server-side data temporarily (we'll merge with client data later)
  // For now, we'll pass it to the frontend via a data attribute
  const serverDataJson = JSON.stringify({
    ip: serverData.ip,
    userAgent: serverData.userAgent,
    os: deviceInfo.os?.name || 'Unknown',
    osVersion: deviceInfo.os?.version || 'Unknown',
    browser: deviceInfo.client?.name || 'Unknown',
    browserVersion: deviceInfo.client?.version || 'Unknown',
    deviceBrand: deviceInfo.device?.brand || 'Unknown',
    deviceModel: deviceInfo.device?.model || 'Unknown',
    deviceType: deviceInfo.device?.type || 'Unknown',
    clientHints: serverData.clientHints
  });
  
  // Render the loading/collector page
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loading...</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .loader {
            text-align: center;
        }
        .spinner {
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top: 4px solid white;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        h1 {
            font-size: 24px;
            margin-bottom: 10px;
        }
        p {
            font-size: 14px;
            opacity: 0.9;
        }
    </style>
</head>
<body>
    <div class="loader">
        <div class="spinner"></div>
        <h1>Loading...</h1>
        <p>Preparing your experience</p>
    </div>
    <script>
        // Pass server data to the collector script
        window.SERVER_DATA = ${serverDataJson};
        window.REDIRECT_ID = '${id}';
    </script>
    <script src="/collector.js"></script>
</body>
</html>
  `);
});

// Logging endpoint: /log/:id
app.post('/log/:id', async (req, res) => {
  const { id } = req.params;
  const clientData = req.body;
  
  try {
    // Merge server and client data
    const fullData = {
      scanId: id,
      timestamp: new Date().toISOString(),
      ...clientData.serverData,
      screenWidth: clientData.screenWidth,
      screenHeight: clientData.screenHeight,
      pixelRatio: clientData.pixelRatio,
      gpuRenderer: clientData.gpuRenderer,
      batteryLevel: clientData.batteryLevel,
      batteryCharging: clientData.batteryCharging,
      redirectUrl: clientData.redirectUrl || 'https://google.com'
    };
    
    // Store in database
    logDeviceData(fullData);
    
    res.json({ 
      success: true, 
      redirectUrl: fullData.redirectUrl 
    });
  } catch (error) {
    console.error('Error logging device data:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to log device data' 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🚀 Device Intelligence Server running on http://localhost:${PORT}`);
  console.log(`📱 Scan the QR code to test: node scripts/generateQR.js`);
});


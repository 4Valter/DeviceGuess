# DeviceGuess

A Device Intelligence tracking solution that generates QR codes to collect technical metadata about user devices before redirecting them to a final destination.

## Features

- 📱 **QR Code Generation**: Generate QR codes that link to tracking endpoints
- 🔍 **Server-Side Detection**: Captures IP address, User-Agent, and Client Hints
- 🎯 **Device Parsing**: Uses `device-detector-js` to identify OS, Browser, and Device Brand
- 💻 **Client-Side Collection**: Captures screen resolution, GPU information, and battery level
- 💾 **Data Storage**: SQLite database for persistent storage of all collected data
- 🚀 **Automatic Redirection**: Redirects users to a destination URL after data collection

## Architecture

```
DeviceGuess/
├── server.js              # Express server with endpoints
├── public/
│   └── collector.js       # Frontend device metadata collector
├── utils/
│   ├── dataCapture.js     # Server-side data capture utilities
│   └── database.js        # SQLite database operations
├── scripts/
│   ├── generateQR.js      # QR code generation utility
│   └── viewData.js        # View collected device data
└── data/
    └── devices.db         # SQLite database (created automatically)
```

## Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Start the server:**
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Usage

### 1. Generate a QR Code

Generate a QR code that points to a tracking endpoint:

```bash
npm run generate-qr
```

Or with custom parameters:
```bash
BASE_URL=http://localhost:3000 SCAN_ID=my-scan-123 node scripts/generateQR.js
```

The QR code will be saved to `public/qr-code.png`.

### 2. Scan and Track

1. Start the server: `npm start`
2. Open the generated QR code image
3. Scan it with a mobile device or browser
4. The system will:
   - Capture server-side data (IP, User-Agent, etc.)
   - Display a loading page
   - Collect client-side data (screen, GPU, battery)
   - Store all data in the database
   - Redirect to the destination URL (default: https://google.com)

### 3. View Collected Data

View all collected device data:

```bash
node scripts/viewData.js
```

Or view data for a specific scan ID:

```bash
node scripts/viewData.js scan-1234567890
```

## API Endpoints

### `GET /s/:id`
The main tracking endpoint. When accessed:
- Captures server-side metadata
- Parses User-Agent for device information
- Renders a loading page with the frontend collector

### `POST /log/:id`
Receives client-side device data and stores it in the database.

**Request Body:**
```json
{
  "serverData": {
    "ip": "192.168.1.1",
    "userAgent": "...",
    "os": "Android",
    "browser": "Chrome",
    ...
  },
  "screenWidth": 1920,
  "screenHeight": 1080,
  "pixelRatio": 2,
  "gpuRenderer": "ANGLE (NVIDIA, ...)",
  "batteryLevel": 0.85,
  "batteryCharging": false,
  "redirectUrl": "https://google.com"
}
```

### `GET /health`
Health check endpoint.

## Collected Data

The system collects the following information:

### Server-Side:
- IP Address
- User-Agent
- OS Name & Version
- Browser Name & Version
- Device Brand & Model
- Device Type
- Client Hints (if available)

### Client-Side:
- Screen Width & Height
- Pixel Ratio
- GPU Renderer (via WebGL)
- Battery Level (if supported)
- Battery Charging Status

## Database Schema

All data is stored in SQLite (`data/devices.db`) with the following structure:

- `id` - Auto-increment ID
- `scan_id` - Unique scan identifier
- `timestamp` - ISO timestamp
- `ip_address` - Client IP address
- `user_agent` - Full User-Agent string
- `os`, `os_version` - Operating system info
- `browser`, `browser_version` - Browser info
- `device_brand`, `device_model`, `device_type` - Device info
- `screen_width`, `screen_height`, `pixel_ratio` - Screen info
- `gpu_renderer` - GPU information
- `battery_level`, `battery_charging` - Battery info
- `redirect_url` - Final destination URL
- `client_hints` - JSON string of Client Hints
- `created_at` - Database timestamp

## Configuration

### Environment Variables

- `PORT` - Server port (default: 3000)
- `BASE_URL` - Base URL for QR code generation (default: http://localhost:3000)
- `SCAN_ID` - Custom scan ID for QR generation (default: auto-generated)

## Development

### Project Structure

- **Backend**: Express.js server handling routing and data storage
- **Frontend**: Vanilla JavaScript collector running in the browser
- **Database**: SQLite for lightweight, file-based storage
- **Utilities**: Scripts for QR generation and data viewing

### Adding Custom Redirect URLs

Modify the `DEFAULT_REDIRECT_URL` in `public/collector.js` or pass it via the server data.

## License

ISC

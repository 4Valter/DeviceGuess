const { initDatabase, getAllDevices, getDevicesByScanId, closeDatabase } = require('../utils/database');

// Get scan ID from command line arguments
const scanId = process.argv[2];

// Initialize database
initDatabase();

try {
  let devices;
  
  if (scanId) {
    console.log(`\n📊 Device data for Scan ID: ${scanId}\n`);
    devices = getDevicesByScanId(scanId);
  } else {
    console.log(`\n📊 All collected device data:\n`);
    devices = getAllDevices();
  }
  
  if (devices.length === 0) {
    console.log('❌ No device data found.\n');
    process.exit(0);
  }
  
  console.log(`Found ${devices.length} record(s)\n`);
  console.log('═'.repeat(80));
  
  devices.forEach((device, index) => {
    console.log(`\n📱 Record #${index + 1}`);
    console.log('─'.repeat(80));
    console.log(`Scan ID:        ${device.scan_id}`);
    console.log(`Timestamp:      ${device.timestamp}`);
    console.log(`IP Address:     ${device.ip_address || 'N/A'}`);
    console.log(`\n🖥️  Device Information:`);
    console.log(`   OS:           ${device.os || 'N/A'} ${device.os_version || ''}`);
    console.log(`   Browser:      ${device.browser || 'N/A'} ${device.browser_version || ''}`);
    console.log(`   Device:       ${device.device_brand || 'N/A'} ${device.device_model || 'N/A'}`);
    console.log(`   Type:         ${device.device_type || 'N/A'}`);
    console.log(`\n📺 Screen Information:`);
    console.log(`   Resolution:   ${device.screen_width || 'N/A'} × ${device.screen_height || 'N/A'}`);
    console.log(`   Pixel Ratio:  ${device.pixel_ratio || 'N/A'}`);
    console.log(`\n🎮 GPU Information:`);
    console.log(`   Renderer:     ${device.gpu_renderer || 'N/A'}`);
    console.log(`\n🔋 Battery Information:`);
    if (device.battery_level !== null) {
      console.log(`   Level:        ${(device.battery_level * 100).toFixed(1)}%`);
      console.log(`   Charging:     ${device.battery_charging ? 'Yes' : 'No'}`);
    } else {
      console.log(`   Not available`);
    }
    console.log(`\n🔗 Redirect URL: ${device.redirect_url || 'N/A'}`);
    
    if (device.client_hints) {
      try {
        const hints = JSON.parse(device.client_hints);
        console.log(`\n💡 Client Hints:`);
        Object.entries(hints).forEach(([key, value]) => {
          console.log(`   ${key}: ${value}`);
        });
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    if (index < devices.length - 1) {
      console.log('\n' + '═'.repeat(80));
    }
  });
  
  console.log('\n');
} catch (error) {
  console.error('❌ Error viewing device data:', error);
  process.exit(1);
} finally {
  closeDatabase();
}


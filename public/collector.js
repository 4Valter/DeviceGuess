/**
 * Device Intelligence Collector
 * Captures client-side device metadata and sends it to the server
 */

(function() {
  'use strict';
  
  // Get server data and redirect ID from window
  const serverData = window.SERVER_DATA || {};
  const redirectId = window.REDIRECT_ID || 'default';
  
  // Default redirect URL
  const DEFAULT_REDIRECT_URL = 'https://google.com';
  
  /**
   * Get GPU information via WebGL
   */
  function getGPUInfo() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      
      if (!gl) {
        return null;
      }
      
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        return {
          vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
          renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        };
      }
      
      // Fallback: try to get renderer from standard parameters
      return {
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER)
      };
    } catch (error) {
      console.error('Error getting GPU info:', error);
      return null;
    }
  }
  
  /**
   * Get battery information (if supported)
   */
  async function getBatteryInfo() {
    try {
      if ('getBattery' in navigator) {
        const battery = await navigator.getBattery();
        return {
          level: Math.round(battery.level * 100) / 100,
          charging: battery.charging
        };
      }
      return null;
    } catch (error) {
      console.error('Error getting battery info:', error);
      return null;
    }
  }
  
  /**
   * Get screen information
   */
  function getScreenInfo() {
    return {
      width: window.screen.width,
      height: window.screen.height,
      pixelRatio: window.devicePixelRatio || 1,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
      colorDepth: window.screen.colorDepth,
      orientation: window.screen.orientation?.type || 'unknown'
    };
  }
  
  /**
   * Get Client Hints data (high-entropy values)
   * This often bypasses masked User-Agents
   */
  async function getClientHintsData() {
    try {
      if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
        const hints = await navigator.userAgentData.getHighEntropyValues([
          'model',
          'platformVersion',
          'architecture',
          'brands'
        ]);
        
        // Extract brand from brands array
        let brand = null;
        if (hints.brands && hints.brands.length > 0) {
          brand = hints.brands[0].brand || null;
        }
        
        return {
          model: hints.model || null,
          brand: brand,
          platformVersion: hints.platformVersion || null,
          architecture: hints.architecture || null,
          brands: hints.brands || null
        };
      }
      return null;
    } catch (error) {
      console.warn('Client Hints API not available or failed:', error);
      return null;
    }
  }

  /**
   * Get Media Query features (screen quality indicators)
   * These help distinguish high-end devices like Motorola Edge 50
   */
  function getMediaQueryFeatures() {
    try {
      return {
        isP3: window.matchMedia('(color-gamut: p3)').matches, // High-quality OLED screen
        isHDR: window.matchMedia('(video-dynamic-range: high)').matches, // HDR support
        // Additional media queries for device quality
        isWideColorGamut: window.matchMedia('(color-gamut: wide)').matches,
        prefersColorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      };
    } catch (error) {
      console.warn('Media Query API not available:', error);
      return {
        isP3: false,
        isHDR: false,
        isWideColorGamut: false,
        prefersColorScheme: null
      };
    }
  }

  /**
   * Collect all device data
   */
  async function collectDeviceData() {
    const screenInfo = getScreenInfo();
    const gpuInfo = getGPUInfo();
    const batteryInfo = await getBatteryInfo();
    const clientHintsData = await getClientHintsData();
    const mediaQueries = getMediaQueryFeatures();
    
    // Get device memory (RAM) if available
    const deviceMemory = navigator.deviceMemory || null;
    
    // Get timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    
    return {
      serverData: serverData,
      screenWidth: screenInfo.width,
      screenHeight: screenInfo.height,
      pixelRatio: screenInfo.pixelRatio,
      gpuRenderer: gpuInfo?.renderer || null,
      gpuVendor: gpuInfo?.vendor || null,
      batteryLevel: batteryInfo?.level || null,
      batteryCharging: batteryInfo?.charging || false,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      deviceMemory: deviceMemory || 'unknown', // RAM in GB (use 'unknown' if not available)
      timezone: timezone, // Timezone for regional variants
      mediaQueries: mediaQueries, // P3, HDR, etc. for high-end device detection
      clientHintsData: clientHintsData, // High-entropy Client Hints
      redirectUrl: DEFAULT_REDIRECT_URL
    };
  }
  
  /**
   * Send data to server and redirect
   */
  async function sendDataAndRedirect() {
    try {
      // Collect device data
      const deviceData = await collectDeviceData();
      
      // Send to server
      const response = await fetch(`/log/${redirectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(deviceData)
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Redirect to the specified URL
        window.location.href = result.redirectUrl || DEFAULT_REDIRECT_URL;
      } else {
        // Fallback redirect on error
        console.error('Failed to log device data:', result.error);
        window.location.href = DEFAULT_REDIRECT_URL;
      }
    } catch (error) {
      console.error('Error sending device data:', error);
      // Fallback redirect on error
      window.location.href = DEFAULT_REDIRECT_URL;
    }
  }
  
  // Start collection when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sendDataAndRedirect);
  } else {
    // DOM is already ready
    sendDataAndRedirect();
  }
})();


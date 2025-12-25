/**
 * Captures server-side data from the request
 */
function captureServerData(req) {
  // Get IP address (considering proxies)
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
             req.headers['x-real-ip'] || 
             req.connection?.remoteAddress || 
             req.socket?.remoteAddress ||
             'Unknown';
  
  // Get User-Agent
  const userAgent = req.headers['user-agent'] || 'Unknown';
  
  // Get Client Hints (if available)
  const clientHints = {
    viewportWidth: req.headers['viewport-width'],
    deviceMemory: req.headers['device-memory'],
    dpr: req.headers['dpr'],
    width: req.headers['width'],
    ect: req.headers['ect'], // Effective connection type
    rtt: req.headers['rtt'], // Round-trip time
    downlink: req.headers['downlink']
  };
  
  // Remove undefined values
  Object.keys(clientHints).forEach(key => {
    if (clientHints[key] === undefined) {
      delete clientHints[key];
    }
  });
  
  return {
    ip: ip.trim(),
    userAgent,
    clientHints: Object.keys(clientHints).length > 0 ? clientHints : null
  };
}

module.exports = {
  captureServerData
};


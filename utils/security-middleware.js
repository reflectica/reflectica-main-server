/**
 * Security middleware for HTTPS enforcement and HSTS headers
 */

/**
 * Middleware to redirect HTTP traffic to HTTPS
 * Supports proxy scenarios by checking X-Forwarded-Proto header
 */
function enforceHTTPS(req, res, next) {
  // Check if running in production or HTTPS enforcement is explicitly enabled
  const enforceHttps = process.env.NODE_ENV === 'production' || process.env.ENFORCE_HTTPS === 'true';
  
  if (!enforceHttps) {
    return next();
  }

  // Check protocol - either direct or via proxy
  const isSecure = req.secure || 
                  req.headers['x-forwarded-proto'] === 'https' ||
                  req.headers['x-forwarded-ssl'] === 'on';

  if (!isSecure) {
    // Redirect to HTTPS
    const httpsUrl = `https://${req.get('host')}${req.originalUrl}`;
    return res.redirect(301, httpsUrl);
  }

  next();
}

/**
 * Middleware to set HSTS headers
 * Configurable via environment variables
 */
function setHSTSHeaders(req, res, next) {
  // Only set HSTS headers on HTTPS connections
  const isSecure = req.secure || 
                  req.headers['x-forwarded-proto'] === 'https' ||
                  req.headers['x-forwarded-ssl'] === 'on';

  if (isSecure) {
    // Default to 1 year (31536000 seconds)
    const maxAge = process.env.HSTS_MAX_AGE || '31536000';
    const includeSubDomains = process.env.HSTS_INCLUDE_SUBDOMAINS !== 'false';
    const preload = process.env.HSTS_PRELOAD === 'true';

    let hstsValue = `max-age=${maxAge}`;
    
    if (includeSubDomains) {
      hstsValue += '; includeSubDomains';
    }
    
    if (preload) {
      hstsValue += '; preload';
    }

    res.setHeader('Strict-Transport-Security', hstsValue);
  }

  next();
}

module.exports = {
  enforceHTTPS,
  setHSTSHeaders
};
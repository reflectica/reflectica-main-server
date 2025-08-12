const auditLogger = require('../utils/auditLogger');
const { v4: uuidv4 } = require('uuid');

/**
 * Middleware to audit PHI access attempts
 * Captures who, what, when, result, IP, user-agent, resource path, and request ID
 */
const auditMiddleware = (action = 'ACCESS') => {
  return async (req, res, next) => {
    // Generate unique request ID
    const requestId = uuidv4();
    req.requestId = requestId;

    // Extract audit information
    const userId = req.body?.userId || req.query?.userId || null;
    const resource = req.originalUrl || req.url;
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
    const userAgent = req.get('User-Agent') || 'Unknown';

    // Metadata without PHI payloads - only safe identifiers
    const metadata = {
      method: req.method,
      sessionId: req.body?.sessionId || req.query?.sessionId || null,
      // Only include safe, non-PHI fields for context
      ...(req.body?.therapyMode && { therapyMode: req.body.therapyMode }),
      ...(req.body?.language && { language: req.body.language }),
      ...(req.body?.sessionType && { sessionType: req.body.sessionType })
    };

    // Start time for measuring request duration
    const startTime = Date.now();

    // Override res.send to capture response status
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      const result = res.statusCode >= 200 && res.statusCode < 400 ? 'SUCCESS' : 'FAILURE';
      
      // Log the audit event
      auditLogger.logEvent({
        userId,
        action,
        resource,
        result,
        requestId,
        ipAddress,
        userAgent,
        metadata: {
          ...metadata,
          statusCode: res.statusCode,
          duration
        }
      });

      // Call original send
      originalSend.call(this, data);
    };

    // Override res.status to capture error responses
    const originalStatus = res.status;
    res.status = function(code) {
      if (code >= 400) {
        const result = 'FAILURE';
        const duration = Date.now() - startTime;
        
        auditLogger.logEvent({
          userId,
          action,
          resource,
          result,
          requestId,
          ipAddress,
          userAgent,
          metadata: {
            ...metadata,
            statusCode: code,
            duration
          }
        });
      }
      return originalStatus.call(this, code);
    };

    next();
  };
};

/**
 * Specialized middleware for different PHI operations
 */
const auditPHIAccess = auditMiddleware('READ');
const auditPHICreate = auditMiddleware('CREATE');
const auditPHIUpdate = auditMiddleware('UPDATE');
const auditPHIDelete = auditMiddleware('DELETE');

module.exports = {
  auditMiddleware,
  auditPHIAccess,
  auditPHICreate,
  auditPHIUpdate,
  auditPHIDelete
};
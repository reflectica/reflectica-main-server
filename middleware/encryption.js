const { encryptFields, decryptFields, getEncryptionKey, isEncrypted } = require('../utils/crypto');

/**
 * Middleware for encrypting/decrypting sensitive fields in API requests and responses
 */

// Configuration for which fields to encrypt per route
const ENCRYPTION_CONFIG = {
  // Chat routes - encrypt user prompts and AI responses
  '/chat': {
    request: ['prompt'],
    response: ['audio', 'response', 'text']
  },
  
  // Session routes - encrypt session data and transcripts  
  '/session/endSession': {
    request: ['sessionId'],
    response: ['chatlog', 'shortSummary', 'longSummary', 'transcripts']
  },
  
  '/session/getAllSessions': {
    response: ['sessions']
  },
  
  '/session/getSessionTranscripts': {
    request: ['sessionId'],
    response: ['transcripts', 'content']
  },
  
  // User routes - encrypt user data
  '/user/updateUserField': {
    request: ['value', 'fieldName']
  },
  
  '/user/deleteEverythingForUser': {
    request: ['userId']
  }
};

// Get encryption key on module load
let encryptionKey;
try {
  encryptionKey = getEncryptionKey();
} catch (error) {
  console.error('Failed to initialize encryption key:', error);
}

/**
 * Recursively processes nested objects to encrypt/decrypt fields
 * @param {any} obj - Object to process
 * @param {Array<string>} fields - Fields to process
 * @param {Function} processor - encryptFields or decryptFields function
 * @param {Buffer} key - Encryption key
 * @returns {any} Processed object
 */
function processNestedFields(obj, fields, processor, key) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => processNestedFields(item, fields, processor, key));
  }
  
  // Process the current level
  let result = processor(obj, fields, key);
  
  // Recursively process nested objects
  Object.keys(result).forEach(prop => {
    if (result[prop] && typeof result[prop] === 'object') {
      result[prop] = processNestedFields(result[prop], fields, processor, key);
    }
  });
  
  return result;
}

/**
 * Middleware to decrypt incoming request payloads
 * @param {string} routePath - Route path for configuration lookup
 * @returns {Function} Express middleware function
 */
function decryptRequest(routePath) {
  return (req, res, next) => {
    if (!encryptionKey || !req.body) {
      return next();
    }
    
    const config = ENCRYPTION_CONFIG[routePath];
    if (!config || !config.request || config.request.length === 0) {
      return next();
    }
    
    try {
      // Check if encryption is enabled for this request
      const encryptionHeader = req.headers['x-encryption-enabled'];
      if (encryptionHeader !== 'true') {
        // Backward compatibility - proceed without decryption
        return next();
      }
      
      req.body = processNestedFields(req.body, config.request, decryptFields, encryptionKey);
      console.log(`Decrypted request fields for ${routePath}: ${config.request.join(', ')}`);
    } catch (error) {
      console.error('Request decryption failed:', error);
      return res.status(400).json({ 
        error: 'Invalid encrypted payload',
        code: 'DECRYPTION_FAILED'
      });
    }
    
    next();
  };
}

/**
 * Middleware to encrypt outgoing response payloads
 * @param {string} routePath - Route path for configuration lookup
 * @returns {Function} Express middleware function
 */
function encryptResponse(routePath) {
  return (req, res, next) => {
    if (!encryptionKey) {
      return next();
    }
    
    const config = ENCRYPTION_CONFIG[routePath];
    if (!config || !config.response || config.response.length === 0) {
      return next();
    }
    
    // Check if encryption is enabled for this request
    const encryptionHeader = req.headers['x-encryption-enabled'];
    if (encryptionHeader !== 'true') {
      // Backward compatibility - proceed without encryption
      return next();
    }
    
    // Override res.json to encrypt response data
    const originalJson = res.json;
    res.json = function(data) {
      try {
        if (data && typeof data === 'object') {
          const encryptedData = processNestedFields(data, config.response, encryptFields, encryptionKey);
          
          // Add encryption metadata
          const responseWithMeta = {
            ...encryptedData,
            _encryption: {
              enabled: true,
              version: '1.0',
              fields: config.response
            }
          };
          
          console.log(`Encrypted response fields for ${routePath}: ${config.response.join(', ')}`);
          return originalJson.call(this, responseWithMeta);
        }
      } catch (error) {
        console.error('Response encryption failed:', error);
        return originalJson.call(this, {
          error: 'Response encryption failed',
          code: 'ENCRYPTION_FAILED'
        });
      }
      
      return originalJson.call(this, data);
    };
    
    next();
  };
}

/**
 * Combined middleware that handles both request decryption and response encryption
 * @param {string} routePath - Route path for configuration lookup
 * @returns {Array<Function>} Array of middleware functions
 */
function encryptionMiddleware(routePath) {
  return [
    decryptRequest(routePath),
    encryptResponse(routePath)
  ];
}

/**
 * Middleware to validate encryption headers and setup
 * @returns {Function} Express middleware function
 */
function validateEncryption() {
  return (req, res, next) => {
    const encryptionEnabled = req.headers['x-encryption-enabled'];
    const clientVersion = req.headers['x-encryption-version'];
    
    // Set response headers for encryption support
    res.setHeader('x-encryption-supported', 'true');
    res.setHeader('x-encryption-version', '1.0');
    
    if (encryptionEnabled === 'true') {
      // Validate client version compatibility
      if (clientVersion && clientVersion !== '1.0') {
        return res.status(400).json({
          error: 'Unsupported encryption version',
          supported: '1.0',
          requested: clientVersion
        });
      }
      
      // Validate encryption key is available
      if (!encryptionKey) {
        return res.status(500).json({
          error: 'Server encryption not properly configured',
          code: 'ENCRYPTION_UNAVAILABLE'
        });
      }
    }
    
    next();
  };
}

/**
 * Test middleware that can be used to verify encryption is working
 * @returns {Function} Express middleware function
 */
function testEncryption() {
  return (req, res, next) => {
    if (req.path === '/encryption-test' && req.method === 'POST') {
      const testData = req.body.testData || 'Hello, encryption!';
      
      try {
        const encrypted = encryptFields({ testData }, ['testData'], encryptionKey);
        const decrypted = decryptFields(encrypted, ['testData'], encryptionKey);
        
        return res.json({
          original: testData,
          encrypted: encrypted.testData,
          decrypted: decrypted.testData,
          success: decrypted.testData === testData
        });
      } catch (error) {
        return res.status(500).json({
          error: 'Encryption test failed',
          message: error.message
        });
      }
    }
    
    next();
  };
}

module.exports = {
  encryptionMiddleware,
  decryptRequest,
  encryptResponse,
  validateEncryption,
  testEncryption,
  ENCRYPTION_CONFIG
};
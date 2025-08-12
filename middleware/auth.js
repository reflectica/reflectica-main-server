const { admin } = require('../config/connection');

/**
 * Middleware to verify Firebase ID token and extract user information
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header with Bearer token required' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token || token.trim() === '') {
      return res.status(401).json({ error: 'Valid token required' });
    }

    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Add user information to request object
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified
    };
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Middleware to ensure user can only access their own data
 * Expects userId in request body or params
 */
const authorizeUser = (req, res, next) => {
  try {
    const { userId } = req.body || req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    if (req.user.uid !== userId) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }
    
    next();
  } catch (error) {
    console.error('Authorization error:', error);
    return res.status(403).json({ error: 'Access denied' });
  }
};

module.exports = {
  authenticateToken,
  authorizeUser
};
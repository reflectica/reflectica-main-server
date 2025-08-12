const { admin } = require('../config/connection');

/**
 * Middleware to authenticate Firebase token and set user information
 */
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const idToken = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!idToken || idToken.trim() === '') {
      return res.status(401).json({ error: 'Missing Firebase ID token' });
    }

    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Set user information in request object
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      roles: decodedToken.roles || ['user'], // Default to 'user' role
      claims: decodedToken
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = {
  authenticateUser
};
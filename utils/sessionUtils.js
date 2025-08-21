const crypto = require('crypto');

/**
 * Generate a unique session ID
 * @returns {string} A unique session identifier
 */
const generateSessionId = () => {
  const timestamp = Date.now().toString();
  const randomBytes = crypto.randomBytes(8).toString('hex');
  return `session_${timestamp}_${randomBytes}`;
};

/**
 * Validate session ID format
 * @param {string} sessionId - The session ID to validate
 * @returns {boolean} True if valid format
 */
const isValidSessionId = (sessionId) => {
  if (!sessionId || typeof sessionId !== 'string') {
    return false;
  }
  
  // Check if it matches our generated format or is a valid existing format
  const generatedFormat = /^session_\d+_[a-f0-9]{16}$/;
  const legacyFormat = /^[a-zA-Z0-9_-]+$/;
  
  return generatedFormat.test(sessionId) || legacyFormat.test(sessionId);
};

/**
 * Validate that a user has access to a session
 * @param {string} userId - The user ID
 * @param {string} sessionId - The session ID  
 * @param {Object} sessionTextsRef - Firestore reference
 * @returns {Promise<boolean>} True if user has access to session
 */
const validateSessionAccess = async (userId, sessionId, sessionTextsRef) => {
  try {
    const querySnapshot = await sessionTextsRef
      .where("uid", "==", userId)
      .where("sessionId", "==", sessionId)
      .limit(1)
      .get();
    
    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error validating session access - database query failed');
    return false;
  }
};

/**
 * Get session statistics
 * @param {string} sessionId - The session ID
 * @param {Object} sessionTextsRef - Firestore reference
 * @returns {Promise<Object>} Session statistics
 */
const getSessionStats = async (sessionId, sessionTextsRef) => {
  try {
    const querySnapshot = await sessionTextsRef
      .where("sessionId", "==", sessionId)
      .get();
    
    if (querySnapshot.empty) {
      return {
        exists: false,
        messageCount: 0,
        lastActivity: null
      };
    }
    
    let messageCount = 0;
    let lastActivity = null;
    
    querySnapshot.forEach(doc => {
      const data = doc.data();
      if (data.chatlog && Array.isArray(data.chatlog)) {
        messageCount += data.chatlog.length;
      }
      if (data.time && (!lastActivity || new Date(data.time) > new Date(lastActivity))) {
        lastActivity = data.time;
      }
    });
    
    return {
      exists: true,
      messageCount,
      lastActivity
    };
  } catch (error) {
    console.error('Error getting session stats - database query failed');
    return {
      exists: false,
      messageCount: 0,
      lastActivity: null
    };
  }
};

module.exports = {
  generateSessionId,
  isValidSessionId,
  validateSessionAccess,
  getSessionStats
};
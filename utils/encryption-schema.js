/**
 * Schema configuration for field-level encryption
 * Defines which fields should be encrypted in each Firestore collection
 */

const ENCRYPTION_SCHEMAS = {
  users: {
    encryptedFields: [
      'email',
      'firstName', 
      'lastName',
      'phoneNumber',
      'address',
      'dateOfBirth',
      'emergencyContact',
      'medicalHistory',
      'personalNotes'
    ],
    // Fields that should never be encrypted (needed for queries)
    excludedFields: [
      'uid',
      'createdAt',
      'updatedAt',
      'isActive',
      'permissions'
    ]
  },

  summaries: {
    encryptedFields: [
      'userDocument',
      'shortSummary',
      'longSummary', 
      'emotions',
      'rawScores',
      'normalizedScores',
      'mentalHealthScore',
      'referralRecommendation',
      'chatlog'
    ],
    excludedFields: [
      'uid',
      'sessionId', 
      'time',
      'createdAt'
    ]
  },

  sessionTexts: {
    encryptedFields: [
      'chatlog',
      'message',
      'userInput',
      'aiResponse'
    ],
    excludedFields: [
      'uid',
      'sessionId',
      'time',
      'createdAt'
    ]
  },

  // Mental health assessment data
  mentalHealthScores: {
    encryptedFields: [
      'phq9Score',
      'gad7Score',
      'cbtBehavioralActivation',
      'rosenbergSelfEsteem',
      'psqiScore',
      'sfqScore',
      'pssScore',
      'ssrsAssessment',
      'assessmentData',
      'notes',
      'recommendations'
    ],
    excludedFields: [
      'uid',
      'sessionId',
      'assessmentDate',
      'assessmentType'
    ]
  },

  // Chat logs (if stored separately from sessionTexts)
  chatLogs: {
    encryptedFields: [
      'content',
      'userMessage',
      'assistantMessage',
      'metadata'
    ],
    excludedFields: [
      'uid',
      'sessionId',
      'timestamp',
      'role',
      'messageId'
    ]
  },

  // User profiles (additional profile information)
  userProfiles: {
    encryptedFields: [
      'personalDetails',
      'healthInformation',
      'preferences',
      'goals',
      'progress',
      'notes'
    ],
    excludedFields: [
      'uid',
      'profileVersion',
      'lastUpdated'
    ]
  },

  // Email subscriptions might contain PII
  subscribedEmails: {
    encryptedFields: [
      'email',
      'preferences'
    ],
    excludedFields: [
      'subscriptionDate',
      'isActive',
      'unsubscribeToken'
    ]
  }
};

/**
 * Get encryption configuration for a collection
 * @param {string} collectionName - Name of the Firestore collection
 * @returns {Object|null} - Encryption configuration or null if not configured
 */
function getEncryptionConfig(collectionName) {
  return ENCRYPTION_SCHEMAS[collectionName] || null;
}

/**
 * Check if a field should be encrypted for a given collection
 * @param {string} collectionName - Name of the collection
 * @param {string} fieldPath - Path to the field (supports dot notation)
 * @returns {boolean} - True if the field should be encrypted
 */
function shouldEncryptField(collectionName, fieldPath) {
  const config = getEncryptionConfig(collectionName);
  if (!config) return false;

  // Check if field is explicitly excluded
  if (config.excludedFields.includes(fieldPath)) {
    return false;
  }

  // Check if field or its parent path should be encrypted
  return config.encryptedFields.some(encryptedField => {
    // Exact match
    if (encryptedField === fieldPath) return true;
    
    // Check if fieldPath is nested under an encrypted field
    if (fieldPath.startsWith(encryptedField + '.')) return true;
    
    // Check if encryptedField is a parent of fieldPath
    const fieldParts = fieldPath.split('.');
    const encryptedParts = encryptedField.split('.');
    
    if (encryptedParts.length <= fieldParts.length) {
      return encryptedParts.every((part, index) => part === fieldParts[index]);
    }
    
    return false;
  });
}

/**
 * Get all encrypted fields for a collection that exist in a document
 * @param {string} collectionName - Name of the collection
 * @param {Object} document - The document to analyze
 * @returns {Array<string>} - Array of field paths that should be encrypted
 */
function getEncryptedFieldsInDocument(collectionName, document) {
  const config = getEncryptionConfig(collectionName);
  if (!config) return [];

  const encryptedFields = [];
  
  function findFieldsRecursive(obj, currentPath = '') {
    for (const [key, value] of Object.entries(obj)) {
      const fieldPath = currentPath ? `${currentPath}.${key}` : key;
      
      if (shouldEncryptField(collectionName, fieldPath)) {
        encryptedFields.push(fieldPath);
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively check nested objects
        findFieldsRecursive(value, fieldPath);
      }
    }
  }
  
  findFieldsRecursive(document);
  return encryptedFields;
}

/**
 * Validate encryption schema configuration
 * @param {string} collectionName - Name of the collection to validate
 * @returns {Object} - Validation result with any errors or warnings
 */
function validateEncryptionSchema(collectionName) {
  const config = getEncryptionConfig(collectionName);
  const errors = [];
  const warnings = [];
  
  if (!config) {
    warnings.push(`No encryption configuration found for collection: ${collectionName}`);
    return { valid: true, errors, warnings };
  }
  
  // Check for overlapping fields
  const overlapping = config.encryptedFields.filter(field => 
    config.excludedFields.includes(field)
  );
  
  if (overlapping.length > 0) {
    errors.push(`Fields cannot be both encrypted and excluded: ${overlapping.join(', ')}`);
  }
  
  // Check for common query fields that shouldn't be encrypted
  const criticalQueryFields = ['uid', 'sessionId', 'userId', 'id'];
  const encryptedCriticalFields = config.encryptedFields.filter(field =>
    criticalQueryFields.includes(field)
  );
  
  if (encryptedCriticalFields.length > 0) {
    warnings.push(`Critical query fields are marked for encryption: ${encryptedCriticalFields.join(', ')}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Migration helper: Get list of all collections that have encryption configured
 * @returns {Array<string>} - Array of collection names
 */
function getEncryptedCollections() {
  return Object.keys(ENCRYPTION_SCHEMAS);
}

module.exports = {
  ENCRYPTION_SCHEMAS,
  getEncryptionConfig,
  shouldEncryptField,
  getEncryptedFieldsInDocument,
  validateEncryptionSchema,
  getEncryptedCollections
};
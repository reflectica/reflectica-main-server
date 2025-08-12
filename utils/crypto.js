const crypto = require('crypto');

/**
 * Crypto utilities for AES-GCM encryption/decryption of sensitive payload fields
 */

// Configuration constants
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128-bit IV for GCM
const TAG_LENGTH = 16; // 128-bit authentication tag
const KEY_LENGTH = 32; // 256-bit key

/**
 * Derives encryption key from master key and salt
 * @param {string} masterKey - Base64 encoded master key
 * @param {string} salt - Salt for key derivation
 * @returns {Buffer} Derived key
 */
function deriveKey(masterKey, salt = 'reflectica-payload-encryption') {
  const masterKeyBuffer = Buffer.from(masterKey, 'base64');
  return crypto.pbkdf2Sync(masterKeyBuffer, salt, 100000, KEY_LENGTH, 'sha256');
}

/**
 * Encrypts a string value using AES-GCM
 * @param {string} plaintext - Text to encrypt
 * @param {Buffer} key - Encryption key
 * @returns {object} Encrypted data with IV and auth tag
 */
function encryptValue(plaintext, key) {
  if (!plaintext || typeof plaintext !== 'string') {
    return null;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    version: '1.0'
  };
}

/**
 * Decrypts an encrypted value
 * @param {object} encryptedData - Object containing encrypted, iv, and authTag
 * @param {Buffer} key - Decryption key
 * @returns {string} Decrypted plaintext
 */
function decryptValue(encryptedData, key) {
  if (!encryptedData || !encryptedData.encrypted) {
    return null;
  }

  try {
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error.message);
    return null;
  }
}

/**
 * Recursively encrypts specified fields in a data object (including nested objects and arrays)
 * @param {any} data - Data to process
 * @param {Array<string>} fieldsToEncrypt - Array of field names to encrypt
 * @param {Buffer} key - Encryption key
 * @returns {any} Processed data with encrypted fields
 */
function encryptFieldsRecursive(data, fieldsToEncrypt, key) {
  if (!data || !fieldsToEncrypt || fieldsToEncrypt.length === 0) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => encryptFieldsRecursive(item, fieldsToEncrypt, key));
  }

  if (typeof data !== 'object') {
    return data;
  }

  const result = { ...data };
  
  // Encrypt fields at current level
  fieldsToEncrypt.forEach(field => {
    if (result[field] && typeof result[field] === 'string') {
      result[field] = encryptValue(result[field], key);
      result[`${field}_encrypted`] = true;
    }
  });
  
  // Recursively process nested objects
  Object.keys(result).forEach(prop => {
    if (result[prop] && typeof result[prop] === 'object' && !isEncrypted(result[prop])) {
      result[prop] = encryptFieldsRecursive(result[prop], fieldsToEncrypt, key);
    }
  });
  
  return result;
}

/**
 * Recursively decrypts specified fields in a data object (including nested objects and arrays)
 * @param {any} data - Data to process
 * @param {Array<string>} fieldsToDecrypt - Array of field names to decrypt
 * @param {Buffer} key - Decryption key
 * @returns {any} Processed data with decrypted fields
 */
function decryptFieldsRecursive(data, fieldsToDecrypt, key) {
  if (!data || !fieldsToDecrypt || fieldsToDecrypt.length === 0) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => decryptFieldsRecursive(item, fieldsToDecrypt, key));
  }

  if (typeof data !== 'object') {
    return data;
  }

  const result = { ...data };
  
  // Decrypt fields at current level
  fieldsToDecrypt.forEach(field => {
    if (result[`${field}_encrypted`] && result[field]) {
      const decrypted = decryptValue(result[field], key);
      if (decrypted !== null) {
        result[field] = decrypted;
        delete result[`${field}_encrypted`];
      }
    }
  });
  
  // Recursively process nested objects
  Object.keys(result).forEach(prop => {
    if (result[prop] && typeof result[prop] === 'object' && !isEncrypted(result[prop])) {
      result[prop] = decryptFieldsRecursive(result[prop], fieldsToDecrypt, key);
    }
  });
  
  return result;
}

/**
 * Encrypts specified fields in a data object
 * @param {object} data - Object containing data to encrypt
 * @param {Array<string>} fieldsToEncrypt - Array of field names to encrypt
 * @param {Buffer} key - Encryption key
 * @returns {object} Object with encrypted fields
 */
function encryptFields(data, fieldsToEncrypt, key) {
  if (!data || !fieldsToEncrypt || fieldsToEncrypt.length === 0) {
    return data;
  }

  const result = { ...data };
  
  fieldsToEncrypt.forEach(field => {
    if (data[field] && typeof data[field] === 'string') {
      result[field] = encryptValue(data[field], key);
      result[`${field}_encrypted`] = true;
    }
  });
  
  return result;
}

/**
 * Decrypts specified fields in a data object
 * @param {object} data - Object containing encrypted data
 * @param {Array<string>} fieldsToDecrypt - Array of field names to decrypt
 * @param {Buffer} key - Decryption key
 * @returns {object} Object with decrypted fields
 */
function decryptFields(data, fieldsToDecrypt, key) {
  if (!data || !fieldsToDecrypt || fieldsToDecrypt.length === 0) {
    return data;
  }

  const result = { ...data };
  
  fieldsToDecrypt.forEach(field => {
    if (data[`${field}_encrypted`] && data[field]) {
      const decrypted = decryptValue(data[field], key);
      if (decrypted !== null) {
        result[field] = decrypted;
        delete result[`${field}_encrypted`];
      }
    }
  });
  
  return result;
}

/**
 * Gets encryption key from environment or generates one
 * @returns {Buffer} Encryption key
 */
function getEncryptionKey() {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  
  if (!masterKey) {
    console.warn('ENCRYPTION_MASTER_KEY not found in environment, using default key (NOT SECURE FOR PRODUCTION)');
    // Generate a default key for development - NOT FOR PRODUCTION
    return crypto.randomBytes(KEY_LENGTH);
  }
  
  return deriveKey(masterKey);
}

/**
 * Validates if a value is encrypted
 * @param {any} value - Value to check
 * @returns {boolean} True if value appears to be encrypted
 */
function isEncrypted(value) {
  if (!value || typeof value !== 'object' || value === null) {
    return false;
  }
  
  return typeof value.encrypted === 'string' &&
         typeof value.iv === 'string' &&
         typeof value.authTag === 'string' &&
         typeof value.version === 'string';
}

module.exports = {
  encryptValue,
  decryptValue,
  encryptFields,
  decryptFields,
  encryptFieldsRecursive,
  decryptFieldsRecursive,
  getEncryptionKey,
  isEncrypted,
  deriveKey,
  // Export constants for testing
  ALGORITHM,
  IV_LENGTH,
  TAG_LENGTH,
  KEY_LENGTH
};
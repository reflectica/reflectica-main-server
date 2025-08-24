const crypto = require('crypto');

class FieldEncryption {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.ivLength = 12; // 96 bits for GCM
    this.tagLength = 16; // 128 bits for GCM
  }

  /**
   * Encrypt a field value using AES-256-GCM
   * @param {string|Object} plaintext - The data to encrypt
   * @param {Buffer} dek - The data encryption key
   * @param {string} aad - Additional authenticated data (field path, user ID, etc.)
   * @returns {Object} - Encrypted data with IV and auth tag
   */
  encryptField(plaintext, dek, aad = '') {
    try {
      // Convert plaintext to string if it's an object
      const plaintextString = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);
      
      // Generate random IV
      const iv = crypto.randomBytes(this.ivLength);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, dek, iv);
      
      // Add additional authenticated data if provided
      if (aad) {
        cipher.setAAD(Buffer.from(aad, 'utf8'));
      }
      
      // Encrypt the data
      let encrypted = cipher.update(plaintextString, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      // Get the authentication tag
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        aad: aad,
        algorithm: this.algorithm
      };
    } catch (error) {
      console.error('Error encrypting field:', error);
      throw new Error(`Field encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt a field value using AES-256-GCM
   * @param {Object} encryptedData - The encrypted data object
   * @param {Buffer} dek - The data encryption key
   * @returns {string} - The decrypted plaintext
   */
  decryptField(encryptedData, dek) {
    try {
      const { encrypted, iv, authTag, aad = '', algorithm } = encryptedData;
      
      // Validate algorithm
      if (algorithm !== this.algorithm) {
        throw new Error(`Unsupported algorithm: ${algorithm}`);
      }
      
      // Convert base64 to buffers
      const encryptedBuffer = Buffer.from(encrypted, 'base64');
      const ivBuffer = Buffer.from(iv, 'base64');
      const authTagBuffer = Buffer.from(authTag, 'base64');
      
      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, dek, ivBuffer);
      decipher.setAuthTag(authTagBuffer);
      
      // Add additional authenticated data if it was used during encryption
      if (aad) {
        decipher.setAAD(Buffer.from(aad, 'utf8'));
      }
      
      // Decrypt the data
      let decrypted = decipher.update(encryptedBuffer);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Error decrypting field:', error);
      throw new Error(`Field decryption failed: ${error.message}`);
    }
  }

  /**
   * Attempt to parse decrypted JSON, return original string if not valid JSON
   * @param {string} decryptedText - The decrypted text
   * @returns {string|Object} - Parsed JSON or original string
   */
  parseDecryptedValue(decryptedText) {
    try {
      return JSON.parse(decryptedText);
    } catch {
      return decryptedText;
    }
  }

  /**
   * Check if a value appears to be encrypted (has our encryption structure)
   * @param {any} value - The value to check
   * @returns {boolean} - True if the value appears to be encrypted
   */
  isEncrypted(value) {
    return !!(
      value &&
      typeof value === 'object' &&
      value !== null &&
      value.encrypted &&
      value.iv &&
      value.authTag &&
      value.algorithm === this.algorithm
    );
  }

  /**
   * Generate Additional Authenticated Data (AAD) for field encryption
   * @param {string} collectionName - Firestore collection name
   * @param {string} documentId - Document ID
   * @param {string} fieldPath - Field path (e.g., 'user.email' or 'chatlog.0.content')
   * @returns {string} - AAD string
   */
  generateAAD(collectionName, documentId, fieldPath) {
    return `${collectionName}:${documentId}:${fieldPath}`;
  }

  /**
   * Batch encrypt multiple fields in a document
   * @param {Object} document - The document with fields to encrypt
   * @param {Array<string>} fieldsToEncrypt - Array of field paths to encrypt
   * @param {Buffer} dek - Data encryption key
   * @param {string} collectionName - Collection name for AAD
   * @param {string} documentId - Document ID for AAD
   * @returns {Object} - Document with encrypted fields
   */
  encryptDocumentFields(document, fieldsToEncrypt, dek, collectionName, documentId) {
    const encryptedDocument = { ...document };
    
    for (const fieldPath of fieldsToEncrypt) {
      const value = this.getNestedValue(document, fieldPath);
      if (value !== undefined && value !== null) {
        const aad = this.generateAAD(collectionName, documentId, fieldPath);
        const encryptedValue = this.encryptField(value, dek, aad);
        this.setNestedValue(encryptedDocument, fieldPath, encryptedValue);
      }
    }
    
    return encryptedDocument;
  }

  /**
   * Batch decrypt multiple fields in a document
   * @param {Object} document - The document with encrypted fields
   * @param {Array<string>} fieldsToDecrypt - Array of field paths to decrypt
   * @param {Buffer} dek - Data encryption key
   * @returns {Object} - Document with decrypted fields
   */
  decryptDocumentFields(document, fieldsToDecrypt, dek) {
    const decryptedDocument = { ...document };
    
    for (const fieldPath of fieldsToDecrypt) {
      const encryptedValue = this.getNestedValue(document, fieldPath);
      if (encryptedValue && this.isEncrypted(encryptedValue)) {
        try {
          const decryptedValue = this.decryptField(encryptedValue, dek);
          const parsedValue = this.parseDecryptedValue(decryptedValue);
          this.setNestedValue(decryptedDocument, fieldPath, parsedValue);
        } catch (error) {
          console.error(`Failed to decrypt field ${fieldPath}:`, error);
          // Keep the encrypted value if decryption fails
        }
      }
    }
    
    return decryptedDocument;
  }

  /**
   * Get nested value from object using dot notation
   * @param {Object} obj - The object
   * @param {string} path - Dot notation path (e.g., 'user.profile.email')
   * @returns {any} - The value at the path
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Set nested value in object using dot notation
   * @param {Object} obj - The object to modify
   * @param {string} path - Dot notation path
   * @param {any} value - The value to set
   */
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);
    target[lastKey] = value;
  }
}

module.exports = FieldEncryption;
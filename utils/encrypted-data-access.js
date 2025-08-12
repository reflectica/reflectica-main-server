const { admin } = require('../config/connection');
const KMSUtils = require('./kms-utils');
const FieldEncryption = require('./field-encryption');
const { getEncryptionConfig, getEncryptedFieldsInDocument } = require('./encryption-schema');

class EncryptedDataAccess {
  constructor() {
    this.db = admin.firestore();
    this.kmsUtils = new KMSUtils();
    this.fieldEncryption = new FieldEncryption();
    
    // Cache for DEKs to avoid repeated KMS calls
    this.dekCache = new Map();
    this.cacheTimeout = 3600000; // 1 hour
    
    // Initialize KMS on startup
    this.initializeKMS();
  }

  /**
   * Initialize KMS resources
   */
  async initializeKMS() {
    try {
      if (process.env.NODE_ENV !== 'test') {
        await this.kmsUtils.initializeKMSResources();
        console.log('KMS resources initialized successfully');
      }
    } catch (error) {
      console.error('Failed to initialize KMS resources:', error);
      // Don't throw here to allow app to start, but log the error
    }
  }

  /**
   * Get or create a Data Encryption Key for a document
   * @param {string} collectionName - Collection name
   * @param {string} documentId - Document ID
   * @returns {Promise<Buffer>} - The DEK
   */
  async getDEK(collectionName, documentId) {
    const cacheKey = `${collectionName}:${documentId}`;
    
    // Check cache first
    const cached = this.dekCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.dek;
    }

    try {
      // Try to get existing DEK from document metadata
      const dekDoc = await this.db
        .collection('_encryption_keys')
        .doc(`${collectionName}_${documentId}`)
        .get();

      let dek;
      if (dekDoc.exists) {
        // Decrypt existing DEK
        const dekData = dekDoc.data();
        const encryptedDEK = Buffer.from(dekData.encryptedDEK, 'base64');
        dek = await this.kmsUtils.decryptDEK(encryptedDEK);
      } else {
        // Create new envelope package
        const envelope = await this.kmsUtils.createEnvelopePackage();
        dek = envelope.dek;

        // Store the encrypted DEK
        await this.db
          .collection('_encryption_keys')
          .doc(`${collectionName}_${documentId}`)
          .set({
            encryptedDEK: envelope.encryptedDEK.toString('base64'),
            keyMetadata: envelope.keyMetadata,
            collectionName,
            documentId,
            createdAt: admin.firestore.Timestamp.now()
          });
      }

      // Cache the DEK
      this.dekCache.set(cacheKey, {
        dek,
        timestamp: Date.now()
      });

      return dek;
    } catch (error) {
      console.error('Error getting DEK:', error);
      throw new Error(`Failed to get encryption key: ${error.message}`);
    }
  }

  /**
   * Encrypt document fields before storing
   * @param {string} collectionName - Collection name
   * @param {string} documentId - Document ID
   * @param {Object} data - Document data
   * @returns {Promise<Object>} - Document with encrypted fields
   */
  async encryptDocument(collectionName, documentId, data) {
    const config = getEncryptionConfig(collectionName);
    if (!config) {
      return data; // No encryption configured for this collection
    }

    try {
      const dek = await this.getDEK(collectionName, documentId);
      const fieldsToEncrypt = getEncryptedFieldsInDocument(collectionName, data);
      
      if (fieldsToEncrypt.length === 0) {
        return data; // No encrypted fields found in this document
      }

      const encryptedData = this.fieldEncryption.encryptDocumentFields(
        data,
        fieldsToEncrypt,
        dek,
        collectionName,
        documentId
      );

      // Add encryption metadata
      encryptedData._encryption = {
        version: '1.0',
        encryptedFields: fieldsToEncrypt,
        lastEncrypted: admin.firestore.Timestamp.now()
      };

      return encryptedData;
    } catch (error) {
      console.error('Error encrypting document:', error);
      throw new Error(`Document encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt document fields after retrieval
   * @param {string} collectionName - Collection name
   * @param {string} documentId - Document ID
   * @param {Object} data - Encrypted document data
   * @returns {Promise<Object>} - Document with decrypted fields
   */
  async decryptDocument(collectionName, documentId, data) {
    const config = getEncryptionConfig(collectionName);
    if (!config || !data._encryption) {
      return data; // No encryption configured or no encrypted fields
    }

    try {
      const dek = await this.getDEK(collectionName, documentId);
      const fieldsToDecrypt = data._encryption.encryptedFields || [];

      if (fieldsToDecrypt.length === 0) {
        return data;
      }

      const decryptedData = this.fieldEncryption.decryptDocumentFields(
        data,
        fieldsToDecrypt,
        dek
      );

      // Remove encryption metadata from the returned data
      delete decryptedData._encryption;

      return decryptedData;
    } catch (error) {
      console.error('Error decrypting document:', error);
      // Return original data if decryption fails, but log the error
      delete data._encryption;
      return data;
    }
  }

  /**
   * Add a document with automatic encryption
   * @param {string} collectionName - Collection name
   * @param {Object} data - Document data
   * @returns {Promise<Object>} - Document reference and ID
   */
  async addDocument(collectionName, data) {
    try {
      const docRef = this.db.collection(collectionName).doc();
      const documentId = docRef.id;
      
      const encryptedData = await this.encryptDocument(collectionName, documentId, data);
      await docRef.set(encryptedData);
      
      return { id: documentId, ref: docRef };
    } catch (error) {
      console.error('Error adding encrypted document:', error);
      throw error;
    }
  }

  /**
   * Set a document with automatic encryption
   * @param {string} collectionName - Collection name
   * @param {string} documentId - Document ID
   * @param {Object} data - Document data
   * @param {Object} options - Firestore set options
   * @returns {Promise<void>}
   */
  async setDocument(collectionName, documentId, data, options = {}) {
    try {
      const encryptedData = await this.encryptDocument(collectionName, documentId, data);
      await this.db.collection(collectionName).doc(documentId).set(encryptedData, options);
    } catch (error) {
      console.error('Error setting encrypted document:', error);
      throw error;
    }
  }

  /**
   * Update a document with automatic encryption for new fields
   * @param {string} collectionName - Collection name
   * @param {string} documentId - Document ID
   * @param {Object} updates - Update data
   * @returns {Promise<void>}
   */
  async updateDocument(collectionName, documentId, updates) {
    try {
      const encryptedUpdates = await this.encryptDocument(collectionName, documentId, updates);
      await this.db.collection(collectionName).doc(documentId).update(encryptedUpdates);
    } catch (error) {
      console.error('Error updating encrypted document:', error);
      throw error;
    }
  }

  /**
   * Get a document with automatic decryption
   * @param {string} collectionName - Collection name
   * @param {string} documentId - Document ID
   * @returns {Promise<Object|null>} - Decrypted document data or null
   */
  async getDocument(collectionName, documentId) {
    try {
      const doc = await this.db.collection(collectionName).doc(documentId).get();
      
      if (!doc.exists) {
        return null;
      }

      const data = doc.data();
      const decryptedData = await this.decryptDocument(collectionName, documentId, data);
      
      return {
        id: doc.id,
        ...decryptedData
      };
    } catch (error) {
      console.error('Error getting encrypted document:', error);
      throw error;
    }
  }

  /**
   * Query documents with automatic decryption
   * NOTE: Encrypted fields cannot be used in queries
   * @param {string} collectionName - Collection name
   * @param {Function} queryBuilder - Function that builds the query
   * @returns {Promise<Array>} - Array of decrypted documents
   */
  async queryDocuments(collectionName, queryBuilder) {
    try {
      let query = this.db.collection(collectionName);
      
      if (queryBuilder) {
        query = queryBuilder(query);
      }

      const snapshot = await query.get();
      const documents = [];

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const decryptedData = await this.decryptDocument(collectionName, doc.id, data);
        documents.push({
          id: doc.id,
          ...decryptedData
        });
      }

      return documents;
    } catch (error) {
      console.error('Error querying encrypted documents:', error);
      throw error;
    }
  }

  /**
   * Delete a document and its encryption key
   * @param {string} collectionName - Collection name
   * @param {string} documentId - Document ID
   * @returns {Promise<void>}
   */
  async deleteDocument(collectionName, documentId) {
    try {
      const batch = this.db.batch();
      
      // Delete the document
      const docRef = this.db.collection(collectionName).doc(documentId);
      batch.delete(docRef);
      
      // Delete the encryption key
      const keyRef = this.db.collection('_encryption_keys').doc(`${collectionName}_${documentId}`);
      batch.delete(keyRef);
      
      await batch.commit();
      
      // Clear cache
      const cacheKey = `${collectionName}:${documentId}`;
      this.dekCache.delete(cacheKey);
    } catch (error) {
      console.error('Error deleting encrypted document:', error);
      throw error;
    }
  }

  /**
   * Get the original Firestore database instance for advanced operations
   * Use with caution - bypasses encryption
   * @returns {Firestore} - The raw Firestore database instance
   */
  getRawDB() {
    console.warn('getRawDB() called - encryption bypassed!');
    return this.db;
  }

  /**
   * Clear the DEK cache (useful for testing or security purposes)
   */
  clearDEKCache() {
    this.dekCache.clear();
  }

  /**
   * Health check for the encryption system
   * @returns {Promise<Object>} - Health status
   */
  async healthCheck() {
    try {
      const kmsHealth = await this.kmsUtils.healthCheck();
      
      return {
        status: kmsHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
        kms: kmsHealth,
        dekCacheSize: this.dekCache.size,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = EncryptedDataAccess;
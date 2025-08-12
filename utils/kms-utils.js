const { KeyManagementServiceClient } = require('@google-cloud/kms');
const crypto = require('crypto');

class KMSUtils {
  constructor() {
    this.client = new KeyManagementServiceClient();
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    this.locationId = process.env.KMS_LOCATION_ID || 'global';
    this.keyRingId = process.env.KMS_KEY_RING_ID || 'reflectica-phi-keys';
    this.keyId = process.env.KMS_KEY_ID || 'phi-encryption-key';
  }

  /**
   * Get the full resource name for the KMS key
   */
  getKeyName() {
    return this.client.cryptoKeyPath(
      this.projectId,
      this.locationId,
      this.keyRingId,
      this.keyId
    );
  }

  /**
   * Generate a new Data Encryption Key (DEK)
   */
  generateDEK() {
    return crypto.randomBytes(32); // 256-bit key for AES-256-GCM
  }

  /**
   * Encrypt a Data Encryption Key using KMS (Key Encryption Key)
   * @param {Buffer} dek - The data encryption key to encrypt
   * @returns {Promise<Buffer>} - The encrypted DEK
   */
  async encryptDEK(dek) {
    try {
      const keyName = this.getKeyName();
      const [result] = await this.client.encrypt({
        name: keyName,
        plaintext: dek,
      });
      return result.ciphertext;
    } catch (error) {
      console.error('Error encrypting DEK with KMS:', error);
      throw new Error(`Failed to encrypt DEK: ${error.message}`);
    }
  }

  /**
   * Decrypt a Data Encryption Key using KMS
   * @param {Buffer} encryptedDEK - The encrypted DEK
   * @returns {Promise<Buffer>} - The decrypted DEK
   */
  async decryptDEK(encryptedDEK) {
    try {
      const keyName = this.getKeyName();
      const [result] = await this.client.decrypt({
        name: keyName,
        ciphertext: encryptedDEK,
      });
      return result.plaintext;
    } catch (error) {
      console.error('Error decrypting DEK with KMS:', error);
      throw new Error(`Failed to decrypt DEK: ${error.message}`);
    }
  }

  /**
   * Create an envelope encryption package with a new DEK
   * @returns {Promise<{encryptedDEK: Buffer, dek: Buffer, keyMetadata: Object}>}
   */
  async createEnvelopePackage() {
    try {
      const dek = this.generateDEK();
      const encryptedDEK = await this.encryptDEK(dek);
      
      const keyMetadata = {
        keyRingId: this.keyRingId,
        keyId: this.keyId,
        projectId: this.projectId,
        locationId: this.locationId,
        createdAt: new Date().toISOString(),
        algorithm: 'AES-256-GCM'
      };

      return {
        encryptedDEK,
        dek,
        keyMetadata
      };
    } catch (error) {
      console.error('Error creating envelope package:', error);
      throw new Error(`Failed to create envelope package: ${error.message}`);
    }
  }

  /**
   * Check if KMS is properly configured
   */
  async healthCheck() {
    try {
      const keyName = this.getKeyName();
      await this.client.getCryptoKey({ name: keyName });
      return { status: 'healthy', keyName };
    } catch (error) {
      console.error('KMS health check failed:', error);
      return { status: 'unhealthy', error: error.message };
    }
  }

  /**
   * Initialize KMS resources (key ring and key) if they don't exist
   * This should be run during application setup
   */
  async initializeKMSResources() {
    try {
      const parent = this.client.locationPath(this.projectId, this.locationId);
      const keyRingPath = this.client.keyRingPath(this.projectId, this.locationId, this.keyRingId);
      
      // Try to create key ring (idempotent)
      try {
        await this.client.createKeyRing({
          parent,
          keyRingId: this.keyRingId,
          keyRing: {}
        });
        console.log(`Created key ring: ${this.keyRingId}`);
      } catch (error) {
        if (!error.message.includes('already exists')) {
          throw error;
        }
        console.log(`Key ring already exists: ${this.keyRingId}`);
      }

      // Try to create crypto key (idempotent)
      try {
        await this.client.createCryptoKey({
          parent: keyRingPath,
          cryptoKeyId: this.keyId,
          cryptoKey: {
            purpose: 'ENCRYPT_DECRYPT'
          }
        });
        console.log(`Created crypto key: ${this.keyId}`);
      } catch (error) {
        if (!error.message.includes('already exists')) {
          throw error;
        }
        console.log(`Crypto key already exists: ${this.keyId}`);
      }

      return { status: 'initialized' };
    } catch (error) {
      console.error('Error initializing KMS resources:', error);
      throw new Error(`Failed to initialize KMS resources: ${error.message}`);
    }
  }
}

module.exports = KMSUtils;
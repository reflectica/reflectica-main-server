const crypto = require('crypto');
const {
  encryptValue,
  decryptValue,
  encryptFields,
  decryptFields,
  getEncryptionKey,
  isEncrypted,
  deriveKey,
  ALGORITHM,
  IV_LENGTH,
  TAG_LENGTH,
  KEY_LENGTH
} = require('../utils/crypto');

describe('Crypto Utils', () => {
  let testKey;

  beforeAll(() => {
    // Generate a test key for consistent testing
    testKey = crypto.randomBytes(KEY_LENGTH);
  });

  describe('deriveKey', () => {
    it('should derive a key from master key and salt', () => {
      const masterKey = crypto.randomBytes(32).toString('base64');
      const key = deriveKey(masterKey, 'test-salt');
      
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(KEY_LENGTH);
    });

    it('should produce different keys with different salts', () => {
      const masterKey = crypto.randomBytes(32).toString('base64');
      const key1 = deriveKey(masterKey, 'salt1');
      const key2 = deriveKey(masterKey, 'salt2');
      
      expect(key1).not.toEqual(key2);
    });

    it('should produce same key with same inputs', () => {
      const masterKey = crypto.randomBytes(32).toString('base64');
      const key1 = deriveKey(masterKey, 'same-salt');
      const key2 = deriveKey(masterKey, 'same-salt');
      
      expect(key1).toEqual(key2);
    });
  });

  describe('encryptValue', () => {
    it('should encrypt a string value', () => {
      const plaintext = 'Hello, World!';
      const encrypted = encryptValue(plaintext, testKey);
      
      expect(encrypted).toBeTruthy();
      expect(encrypted.encrypted).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.authTag).toBeTruthy();
      expect(encrypted.version).toBe('1.0');
    });

    it('should return null for null input', () => {
      const result = encryptValue(null, testKey);
      expect(result).toBeNull();
    });

    it('should return null for non-string input', () => {
      const result = encryptValue(123, testKey);
      expect(result).toBeNull();
    });

    it('should produce different outputs for same input (due to random IV)', () => {
      const plaintext = 'Same input';
      const encrypted1 = encryptValue(plaintext, testKey);
      const encrypted2 = encryptValue(plaintext, testKey);
      
      expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });
  });

  describe('decryptValue', () => {
    it('should decrypt an encrypted value', () => {
      const plaintext = 'Hello, World!';
      const encrypted = encryptValue(plaintext, testKey);
      const decrypted = decryptValue(encrypted, testKey);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should return null for null input', () => {
      const result = decryptValue(null, testKey);
      expect(result).toBeNull();
    });

    it('should return null for invalid encrypted data', () => {
      const invalidData = { encrypted: 'invalid', iv: 'invalid', authTag: 'invalid' };
      const result = decryptValue(invalidData, testKey);
      expect(result).toBeNull();
    });

    it('should return null for missing encrypted field', () => {
      const invalidData = { iv: 'some-iv', authTag: 'some-tag' };
      const result = decryptValue(invalidData, testKey);
      expect(result).toBeNull();
    });

    it('should handle wrong key gracefully', () => {
      const plaintext = 'Secret message';
      const encrypted = encryptValue(plaintext, testKey);
      const wrongKey = crypto.randomBytes(KEY_LENGTH);
      const result = decryptValue(encrypted, wrongKey);
      
      expect(result).toBeNull();
    });
  });

  describe('encryptFields', () => {
    it('should encrypt specified fields in an object', () => {
      const data = {
        publicField: 'public data',
        secretField: 'secret data',
        anotherSecret: 'another secret'
      };
      const fieldsToEncrypt = ['secretField', 'anotherSecret'];
      
      const result = encryptFields(data, fieldsToEncrypt, testKey);
      
      expect(result.publicField).toBe('public data');
      expect(result.secretField).toBeTruthy();
      expect(result.secretField.encrypted).toBeTruthy();
      expect(result.secretField_encrypted).toBe(true);
      expect(result.anotherSecret).toBeTruthy();
      expect(result.anotherSecret.encrypted).toBeTruthy();
      expect(result.anotherSecret_encrypted).toBe(true);
    });

    it('should handle empty fields array', () => {
      const data = { field: 'value' };
      const result = encryptFields(data, [], testKey);
      
      expect(result).toEqual(data);
    });

    it('should handle null data', () => {
      const result = encryptFields(null, ['field'], testKey);
      expect(result).toBeNull();
    });

    it('should skip non-string fields', () => {
      const data = {
        stringField: 'text',
        numberField: 123,
        objectField: { nested: 'value' }
      };
      const fieldsToEncrypt = ['stringField', 'numberField', 'objectField'];
      
      const result = encryptFields(data, fieldsToEncrypt, testKey);
      
      expect(result.stringField.encrypted).toBeTruthy();
      expect(result.numberField).toBe(123);
      expect(result.objectField).toEqual({ nested: 'value' });
    });
  });

  describe('decryptFields', () => {
    it('should decrypt encrypted fields in an object', () => {
      const originalData = {
        publicField: 'public data',
        secretField: 'secret data',
        anotherSecret: 'another secret'
      };
      const fieldsToEncrypt = ['secretField', 'anotherSecret'];
      
      const encrypted = encryptFields(originalData, fieldsToEncrypt, testKey);
      const decrypted = decryptFields(encrypted, fieldsToEncrypt, testKey);
      
      expect(decrypted.publicField).toBe('public data');
      expect(decrypted.secretField).toBe('secret data');
      expect(decrypted.anotherSecret).toBe('another secret');
      expect(decrypted.secretField_encrypted).toBeUndefined();
      expect(decrypted.anotherSecret_encrypted).toBeUndefined();
    });

    it('should handle fields that are not encrypted', () => {
      const data = {
        normalField: 'normal value',
        normalField_encrypted: false
      };
      
      const result = decryptFields(data, ['normalField'], testKey);
      expect(result.normalField).toBe('normal value');
    });

    it('should handle empty fields array', () => {
      const data = { field: 'value' };
      const result = decryptFields(data, [], testKey);
      
      expect(result).toEqual(data);
    });

    it('should handle null data', () => {
      const result = decryptFields(null, ['field'], testKey);
      expect(result).toBeNull();
    });
  });

  describe('isEncrypted', () => {
    it('should identify encrypted values', () => {
      const plaintext = 'test data';
      const encrypted = encryptValue(plaintext, testKey);
      
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should identify non-encrypted values', () => {
      expect(isEncrypted('plain string')).toBe(false);
      expect(isEncrypted(123)).toBe(false);
      expect(isEncrypted(null)).toBe(false);
      expect(isEncrypted({ other: 'object' })).toBe(false);
    });

    it('should handle incomplete encrypted objects', () => {
      expect(isEncrypted({ encrypted: 'data' })).toBe(false); // missing iv, authTag, version
      expect(isEncrypted({ encrypted: 'data', iv: 'iv' })).toBe(false); // missing authTag, version
    });
  });

  describe('getEncryptionKey', () => {
    beforeEach(() => {
      // Clear environment variable for each test
      delete process.env.ENCRYPTION_MASTER_KEY;
    });

    it('should derive key from environment variable when available', () => {
      const masterKey = crypto.randomBytes(32).toString('base64');
      process.env.ENCRYPTION_MASTER_KEY = masterKey;
      
      const key = getEncryptionKey();
      
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(KEY_LENGTH);
    });

    it('should generate default key when environment variable is missing', () => {
      const key = getEncryptionKey();
      
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(KEY_LENGTH);
    });
  });

  describe('Round-trip encryption/decryption', () => {
    it('should handle complex nested data structures', () => {
      const complexData = {
        user: {
          id: 'user123',
          profile: {
            name: 'John Doe',
            email: 'john@example.com'
          }
        },
        sessions: [
          { id: 'session1', content: 'First session' },
          { id: 'session2', content: 'Second session' }
        ],
        metadata: {
          created: '2024-01-01',
          type: 'therapy'
        }
      };
      
      const fieldsToEncrypt = ['content', 'email', 'name'];
      
      // Use recursive functions for nested data
      const { encryptFieldsRecursive, decryptFieldsRecursive } = require('../utils/crypto');
      
      // Encrypt
      const encrypted = encryptFieldsRecursive(complexData, fieldsToEncrypt, testKey);
      
      // Verify encryption happened
      expect(encrypted.user.profile.name.encrypted).toBeTruthy();
      expect(encrypted.user.profile.email.encrypted).toBeTruthy();
      expect(encrypted.sessions[0].content.encrypted).toBeTruthy();
      expect(encrypted.sessions[1].content.encrypted).toBeTruthy();
      
      // Decrypt
      const decrypted = decryptFieldsRecursive(encrypted, fieldsToEncrypt, testKey);
      
      // Verify original data is restored
      expect(decrypted.user.profile.name).toBe('John Doe');
      expect(decrypted.user.profile.email).toBe('john@example.com');
      expect(decrypted.sessions[0].content).toBe('First session');
      expect(decrypted.sessions[1].content).toBe('Second session');
      expect(decrypted.user.id).toBe('user123');
      expect(decrypted.metadata.created).toBe('2024-01-01');
    });

    it('should handle array data with encrypted fields', () => {
      const arrayData = [
        { id: 1, message: 'First message', public: 'public1' },
        { id: 2, message: 'Second message', public: 'public2' }
      ];
      
      const fieldsToEncrypt = ['message'];
      
      // Note: encryptFields works on single objects, not arrays directly
      // In real usage, the middleware handles array processing
      const encrypted = arrayData.map(item => encryptFields(item, fieldsToEncrypt, testKey));
      const decrypted = encrypted.map(item => decryptFields(item, fieldsToEncrypt, testKey));
      
      expect(decrypted[0].message).toBe('First message');
      expect(decrypted[1].message).toBe('Second message');
      expect(decrypted[0].public).toBe('public1');
      expect(decrypted[1].public).toBe('public2');
    });
  });

  describe('Error handling', () => {
    it('should handle corrupted encrypted data gracefully', () => {
      const plaintext = 'test data';
      const encrypted = encryptValue(plaintext, testKey);
      
      // Corrupt the encrypted data
      encrypted.encrypted = 'corrupted';
      
      const result = decryptValue(encrypted, testKey);
      expect(result).toBeNull();
    });

    it('should handle corrupted auth tag gracefully', () => {
      const plaintext = 'test data';
      const encrypted = encryptValue(plaintext, testKey);
      
      // Corrupt the auth tag
      encrypted.authTag = Buffer.from('corrupted').toString('base64');
      
      const result = decryptValue(encrypted, testKey);
      expect(result).toBeNull();
    });

    it('should handle invalid IV gracefully', () => {
      const plaintext = 'test data';
      const encrypted = encryptValue(plaintext, testKey);
      
      // Corrupt the IV
      encrypted.iv = 'invalid-iv';
      
      const result = decryptValue(encrypted, testKey);
      expect(result).toBeNull();
    });
  });
});
const FieldEncryption = require('../../utils/field-encryption');
const crypto = require('crypto');

describe('FieldEncryption', () => {
  let fieldEncryption;
  let testDEK;

  beforeEach(() => {
    fieldEncryption = new FieldEncryption();
    testDEK = crypto.randomBytes(32); // 256-bit key
  });

  describe('encryptField and decryptField', () => {
    test('should encrypt and decrypt a simple string', () => {
      const plaintext = 'sensitive patient information';
      const aad = 'users:user123:email';
      
      const encrypted = fieldEncryption.encryptField(plaintext, testDEK, aad);
      
      expect(encrypted).toHaveProperty('encrypted');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('authTag');
      expect(encrypted).toHaveProperty('aad', aad);
      expect(encrypted).toHaveProperty('algorithm', 'aes-256-gcm');
      
      const decrypted = fieldEncryption.decryptField(encrypted, testDEK);
      expect(decrypted).toBe(plaintext);
    });

    test('should encrypt and decrypt a JSON object', () => {
      const plaintext = { name: 'John Doe', score: 85, notes: 'Patient shows improvement' };
      const aad = 'summaries:session456:rawScores';
      
      const encrypted = fieldEncryption.encryptField(plaintext, testDEK, aad);
      const decrypted = fieldEncryption.decryptField(encrypted, testDEK);
      const parsed = fieldEncryption.parseDecryptedValue(decrypted);
      
      expect(parsed).toEqual(plaintext);
    });

    test('should work without additional authenticated data', () => {
      const plaintext = 'test data without aad';
      
      const encrypted = fieldEncryption.encryptField(plaintext, testDEK);
      const decrypted = fieldEncryption.decryptField(encrypted, testDEK);
      
      expect(decrypted).toBe(plaintext);
    });

    test('should fail with wrong decryption key', () => {
      const plaintext = 'sensitive data';
      const wrongDEK = crypto.randomBytes(32);
      
      const encrypted = fieldEncryption.encryptField(plaintext, testDEK);
      
      expect(() => {
        fieldEncryption.decryptField(encrypted, wrongDEK);
      }).toThrow();
    });

    test('should fail with tampered ciphertext', () => {
      const plaintext = 'sensitive data';
      
      const encrypted = fieldEncryption.encryptField(plaintext, testDEK);
      // Tamper with the encrypted data
      encrypted.encrypted = encrypted.encrypted.slice(0, -4) + 'XXXX';
      
      expect(() => {
        fieldEncryption.decryptField(encrypted, testDEK);
      }).toThrow();
    });

    test('should fail with wrong AAD', () => {
      const plaintext = 'sensitive data';
      const correctAAD = 'users:user123:email';
      const wrongAAD = 'users:user456:email';
      
      const encrypted = fieldEncryption.encryptField(plaintext, testDEK, correctAAD);
      // Change AAD to wrong value
      encrypted.aad = wrongAAD;
      
      expect(() => {
        fieldEncryption.decryptField(encrypted, testDEK);
      }).toThrow();
    });
  });

  describe('isEncrypted', () => {
    test('should identify encrypted values correctly', () => {
      const encrypted = fieldEncryption.encryptField('test', testDEK);
      
      expect(fieldEncryption.isEncrypted(encrypted)).toBe(true);
      expect(fieldEncryption.isEncrypted('plain text')).toBe(false);
      expect(fieldEncryption.isEncrypted(123)).toBe(false);
      expect(fieldEncryption.isEncrypted(null)).toBe(false);
      expect(fieldEncryption.isEncrypted({})).toBe(false);
    });
  });

  describe('generateAAD', () => {
    test('should generate consistent AAD', () => {
      const aad = fieldEncryption.generateAAD('users', 'user123', 'email');
      expect(aad).toBe('users:user123:email');
    });
  });

  describe('encryptDocumentFields and decryptDocumentFields', () => {
    test('should encrypt and decrypt specified fields in a document', () => {
      const document = {
        uid: 'user123',
        email: 'patient@example.com',
        firstName: 'John',
        lastName: 'Doe',
        publicInfo: 'This should not be encrypted'
      };
      
      const fieldsToEncrypt = ['email', 'firstName', 'lastName'];
      const collectionName = 'users';
      const documentId = 'user123';
      
      const encrypted = fieldEncryption.encryptDocumentFields(
        document,
        fieldsToEncrypt,
        testDEK,
        collectionName,
        documentId
      );
      
      // Check that specified fields are encrypted
      expect(fieldEncryption.isEncrypted(encrypted.email)).toBe(true);
      expect(fieldEncryption.isEncrypted(encrypted.firstName)).toBe(true);
      expect(fieldEncryption.isEncrypted(encrypted.lastName)).toBe(true);
      
      // Check that other fields are not encrypted
      expect(encrypted.uid).toBe('user123');
      expect(encrypted.publicInfo).toBe('This should not be encrypted');
      
      // Decrypt and verify
      const decrypted = fieldEncryption.decryptDocumentFields(encrypted, fieldsToEncrypt, testDEK);
      expect(decrypted.email).toBe('patient@example.com');
      expect(decrypted.firstName).toBe('John');
      expect(decrypted.lastName).toBe('Doe');
      expect(decrypted.uid).toBe('user123');
      expect(decrypted.publicInfo).toBe('This should not be encrypted');
    });

    test('should handle nested field paths', () => {
      const document = {
        uid: 'user123',
        profile: {
          personal: {
            email: 'test@example.com',
            phone: '555-1234'
          },
          public: {
            username: 'johndoe'
          }
        }
      };
      
      const fieldsToEncrypt = ['profile.personal.email', 'profile.personal.phone'];
      
      const encrypted = fieldEncryption.encryptDocumentFields(
        document,
        fieldsToEncrypt,
        testDEK,
        'users',
        'user123'
      );
      
      expect(fieldEncryption.isEncrypted(encrypted.profile.personal.email)).toBe(true);
      expect(fieldEncryption.isEncrypted(encrypted.profile.personal.phone)).toBe(true);
      expect(encrypted.profile.public.username).toBe('johndoe');
      
      const decrypted = fieldEncryption.decryptDocumentFields(encrypted, fieldsToEncrypt, testDEK);
      expect(decrypted.profile.personal.email).toBe('test@example.com');
      expect(decrypted.profile.personal.phone).toBe('555-1234');
    });
  });

  describe('nested value operations', () => {
    test('should get nested values correctly', () => {
      const obj = {
        level1: {
          level2: {
            level3: 'value'
          }
        }
      };
      
      expect(fieldEncryption.getNestedValue(obj, 'level1.level2.level3')).toBe('value');
      expect(fieldEncryption.getNestedValue(obj, 'level1.level2')).toEqual({ level3: 'value' });
      expect(fieldEncryption.getNestedValue(obj, 'nonexistent')).toBeUndefined();
      expect(fieldEncryption.getNestedValue(obj, 'level1.nonexistent')).toBeUndefined();
    });

    test('should set nested values correctly', () => {
      const obj = {};
      
      fieldEncryption.setNestedValue(obj, 'level1.level2.level3', 'test value');
      expect(obj.level1.level2.level3).toBe('test value');
      
      fieldEncryption.setNestedValue(obj, 'level1.level2.level4', 'another value');
      expect(obj.level1.level2.level4).toBe('another value');
      expect(obj.level1.level2.level3).toBe('test value'); // Should not affect existing
    });
  });

  describe('parseDecryptedValue', () => {
    test('should parse valid JSON', () => {
      const jsonString = '{"key": "value", "number": 42}';
      const parsed = fieldEncryption.parseDecryptedValue(jsonString);
      expect(parsed).toEqual({ key: 'value', number: 42 });
    });

    test('should return original string for invalid JSON', () => {
      const invalidJson = 'not valid json';
      const result = fieldEncryption.parseDecryptedValue(invalidJson);
      expect(result).toBe('not valid json');
    });
  });
});
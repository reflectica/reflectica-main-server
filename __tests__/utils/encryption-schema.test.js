const { 
  getEncryptionConfig, 
  shouldEncryptField, 
  getEncryptedFieldsInDocument,
  validateEncryptionSchema,
  getEncryptedCollections
} = require('../../utils/encryption-schema');

describe('EncryptionSchema', () => {
  describe('getEncryptionConfig', () => {
    test('should return config for known collections', () => {
      const usersConfig = getEncryptionConfig('users');
      expect(usersConfig).toBeDefined();
      expect(usersConfig.encryptedFields).toContain('email');
      expect(usersConfig.excludedFields).toContain('uid');
    });

    test('should return null for unknown collections', () => {
      const config = getEncryptionConfig('unknownCollection');
      expect(config).toBeNull();
    });
  });

  describe('shouldEncryptField', () => {
    test('should return true for encrypted fields', () => {
      expect(shouldEncryptField('users', 'email')).toBe(true);
      expect(shouldEncryptField('users', 'firstName')).toBe(true);
      expect(shouldEncryptField('summaries', 'chatlog')).toBe(true);
    });

    test('should return false for excluded fields', () => {
      expect(shouldEncryptField('users', 'uid')).toBe(false);
      expect(shouldEncryptField('summaries', 'sessionId')).toBe(false);
    });

    test('should return false for unknown collections', () => {
      expect(shouldEncryptField('unknownCollection', 'anyField')).toBe(false);
    });

    test('should handle nested field paths', () => {
      expect(shouldEncryptField('summaries', 'emotions.anxiety')).toBe(true);
      expect(shouldEncryptField('summaries', 'rawScores.phq9')).toBe(true);
    });
  });

  describe('getEncryptedFieldsInDocument', () => {
    test('should identify encrypted fields in a users document', () => {
      const document = {
        uid: 'user123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        createdAt: '2023-01-01',
        unknownField: 'value'
      };

      const encryptedFields = getEncryptedFieldsInDocument('users', document);
      expect(encryptedFields).toContain('email');
      expect(encryptedFields).toContain('firstName');
      expect(encryptedFields).toContain('lastName');
      expect(encryptedFields).not.toContain('uid');
      expect(encryptedFields).not.toContain('createdAt');
    });

    test('should handle nested objects in summaries', () => {
      const document = {
        uid: 'user123',
        sessionId: 'session456',
        emotions: {
          anxiety: 0.7,
          depression: 0.3
        },
        rawScores: {
          phq9: 12,
          gad7: 8
        },
        time: '2023-01-01'
      };

      const encryptedFields = getEncryptedFieldsInDocument('summaries', document);
      expect(encryptedFields).toContain('emotions');
      expect(encryptedFields).toContain('rawScores');
      expect(encryptedFields).not.toContain('uid');
      expect(encryptedFields).not.toContain('sessionId');
      expect(encryptedFields).not.toContain('time');
    });

    test('should return empty array for unknown collections', () => {
      const document = { field1: 'value1', field2: 'value2' };
      const encryptedFields = getEncryptedFieldsInDocument('unknownCollection', document);
      expect(encryptedFields).toEqual([]);
    });
  });

  describe('validateEncryptionSchema', () => {
    test('should validate known collections successfully', () => {
      const result = validateEncryptionSchema('users');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should warn about unknown collections', () => {
      const result = validateEncryptionSchema('unknownCollection');
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('No encryption configuration found for collection: unknownCollection');
    });

    test('should detect if critical query fields are marked for encryption', () => {
      // This test depends on the actual schema configuration
      // We're testing the validation logic itself
      const result = validateEncryptionSchema('users');
      expect(result.valid).toBe(true);
      
      // Check that uid is not in encrypted fields (this should pass for our schema)
      const config = getEncryptionConfig('users');
      expect(config.encryptedFields).not.toContain('uid');
    });
  });

  describe('getEncryptedCollections', () => {
    test('should return list of all configured collections', () => {
      const collections = getEncryptedCollections();
      expect(collections).toContain('users');
      expect(collections).toContain('summaries');
      expect(collections).toContain('sessionTexts');
      expect(Array.isArray(collections)).toBe(true);
      expect(collections.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    test('should handle empty documents', () => {
      const encryptedFields = getEncryptedFieldsInDocument('users', {});
      expect(encryptedFields).toEqual([]);
    });

    test('should handle documents with null values', () => {
      const document = {
        uid: 'user123',
        email: null,
        firstName: undefined,
        lastName: 'Doe'
      };

      const encryptedFields = getEncryptedFieldsInDocument('users', document);
      // Should include fields that exist, even if null/undefined
      expect(encryptedFields).toContain('lastName');
    });

    test('should handle deeply nested structures', () => {
      const document = {
        uid: 'user123',
        personalNotes: {
          level1: {
            level2: {
              level3: 'deep value'
            }
          }
        }
      };

      const encryptedFields = getEncryptedFieldsInDocument('users', document);
      expect(encryptedFields).toContain('personalNotes');
    });
  });
});
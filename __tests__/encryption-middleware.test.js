const request = require('supertest');
const express = require('express');
const {
  encryptionMiddleware,
  decryptRequest,
  encryptResponse,
  validateEncryption,
  testEncryption,
  ENCRYPTION_CONFIG
} = require('../middleware/encryption');
const { encryptFields, getEncryptionKey } = require('../utils/crypto');

// Mock the crypto module to avoid environment dependency in tests
jest.mock('../utils/crypto', () => {
  const crypto = require('crypto');
  const testKey = crypto.randomBytes(32);
  
  return {
    encryptFields: jest.fn().mockImplementation((data, fields, key) => {
      const result = { ...data };
      fields.forEach(field => {
        if (data[field] && typeof data[field] === 'string') {
          result[field] = {
            encrypted: Buffer.from(data[field]).toString('base64'),
            iv: 'test-iv',
            authTag: 'test-tag',
            version: '1.0'
          };
          result[`${field}_encrypted`] = true;
        }
      });
      return result;
    }),
    decryptFields: jest.fn().mockImplementation((data, fields, key) => {
      const result = { ...data };
      fields.forEach(field => {
        if (data[`${field}_encrypted`] && data[field] && data[field].encrypted) {
          result[field] = Buffer.from(data[field].encrypted, 'base64').toString();
          delete result[`${field}_encrypted`];
        }
      });
      return result;
    }),
    getEncryptionKey: jest.fn().mockReturnValue(testKey),
    isEncrypted: jest.fn().mockImplementation((value) => {
      return value && typeof value === 'object' && value.encrypted && value.iv && value.authTag;
    })
  };
});

describe('Encryption Middleware', () => {
  let app;
  let mockKey;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Reset mocks
    jest.clearAllMocks();
    
    mockKey = Buffer.from('test-key-32-bytes-long-test-key');
    require('../utils/crypto').getEncryptionKey.mockReturnValue(mockKey);
  });

  describe('validateEncryption middleware', () => {
    beforeEach(() => {
      app.use(validateEncryption());
      app.get('/test', (req, res) => res.json({ message: 'success' }));
    });

    it('should set encryption support headers', async () => {
      const res = await request(app).get('/test');
      
      expect(res.headers['x-encryption-supported']).toBe('true');
      expect(res.headers['x-encryption-version']).toBe('1.0');
      expect(res.status).toBe(200);
    });

    it('should validate encryption version', async () => {
      const res = await request(app)
        .get('/test')
        .set('x-encryption-enabled', 'true')
        .set('x-encryption-version', '2.0');
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Unsupported encryption version');
    });

    it('should accept valid encryption version', async () => {
      const res = await request(app)
        .get('/test')
        .set('x-encryption-enabled', 'true')
        .set('x-encryption-version', '1.0');
      
      expect(res.status).toBe(200);
    });

    it('should handle missing encryption key', async () => {
      require('../utils/crypto').getEncryptionKey.mockReturnValue(null);
      
      const res = await request(app)
        .get('/test')
        .set('x-encryption-enabled', 'true');
      
      expect(res.status).toBe(500);
      expect(res.body.code).toBe('ENCRYPTION_UNAVAILABLE');
    });
  });

  describe('decryptRequest middleware', () => {
    beforeEach(() => {
      app.use(decryptRequest('/chat'));
      app.post('/chat', (req, res) => res.json(req.body));
    });

    it('should decrypt request fields when encryption is enabled', async () => {
      const encryptedPrompt = {
        encrypted: Buffer.from('Hello AI').toString('base64'),
        iv: 'test-iv',
        authTag: 'test-tag',
        version: '1.0'
      };

      const res = await request(app)
        .post('/chat')
        .set('x-encryption-enabled', 'true')
        .send({
          prompt: encryptedPrompt,
          prompt_encrypted: true,
          userId: 'user123'
        });

      expect(res.status).toBe(200);
      expect(require('../utils/crypto').decryptFields).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: encryptedPrompt,
          prompt_encrypted: true,
          userId: 'user123'
        }),
        ['prompt'],
        mockKey
      );
    });

    it('should skip decryption when encryption is not enabled', async () => {
      const res = await request(app)
        .post('/chat')
        .send({
          prompt: 'Hello AI',
          userId: 'user123'
        });

      expect(res.status).toBe(200);
      expect(require('../utils/crypto').decryptFields).not.toHaveBeenCalled();
      expect(res.body.prompt).toBe('Hello AI');
    });

    it('should handle decryption errors', async () => {
      require('../utils/crypto').decryptFields.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const res = await request(app)
        .post('/chat')
        .set('x-encryption-enabled', 'true')
        .send({
          prompt: { encrypted: 'invalid' },
          prompt_encrypted: true
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('DECRYPTION_FAILED');
    });

    it('should skip when no encryption config exists', async () => {
      app.use(decryptRequest('/nonexistent'));
      app.post('/nonexistent', (req, res) => res.json(req.body));

      const res = await request(app)
        .post('/nonexistent')
        .set('x-encryption-enabled', 'true')
        .send({ data: 'test' });

      expect(res.status).toBe(200);
      expect(require('../utils/crypto').decryptFields).not.toHaveBeenCalled();
    });
  });

  describe('encryptResponse middleware', () => {
    beforeEach(() => {
      app.use(encryptResponse('/chat'));
      app.post('/chat', (req, res) => {
        res.json({
          audio: 'audio-data',
          response: 'AI response',
          metadata: 'public'
        });
      });
    });

    it('should encrypt response fields when encryption is enabled', async () => {
      const res = await request(app)
        .post('/chat')
        .set('x-encryption-enabled', 'true')
        .send({});

      expect(res.status).toBe(200);
      expect(require('../utils/crypto').encryptFields).toHaveBeenCalled();
      expect(res.body._encryption).toEqual({
        enabled: true,
        version: '1.0',
        fields: ['audio', 'response', 'text']
      });
    });

    it('should skip encryption when not enabled', async () => {
      const res = await request(app)
        .post('/chat')
        .send({});

      expect(res.status).toBe(200);
      expect(require('../utils/crypto').encryptFields).not.toHaveBeenCalled();
      expect(res.body._encryption).toBeUndefined();
      expect(res.body.audio).toBe('audio-data');
    });

    it('should handle encryption errors', async () => {
      require('../utils/crypto').encryptFields.mockImplementation(() => {
        throw new Error('Encryption failed');
      });

      const res = await request(app)
        .post('/chat')
        .set('x-encryption-enabled', 'true')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('ENCRYPTION_FAILED');
    });
  });

  describe('encryptionMiddleware combined', () => {
    beforeEach(() => {
      app.use('/chat', encryptionMiddleware('/chat'));
      app.post('/chat', (req, res) => {
        res.json({
          echo: req.body.prompt,
          response: 'AI response to: ' + req.body.prompt
        });
      });
    });

    it('should handle full encryption cycle', async () => {
      const encryptedPrompt = {
        encrypted: Buffer.from('Hello AI').toString('base64'),
        iv: 'test-iv',
        authTag: 'test-tag',
        version: '1.0'
      };

      const res = await request(app)
        .post('/chat')
        .set('x-encryption-enabled', 'true')
        .send({
          prompt: encryptedPrompt,
          prompt_encrypted: true,
          userId: 'user123'
        });

      expect(res.status).toBe(200);
      
      // Verify decryption was called for request
      expect(require('../utils/crypto').decryptFields).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: encryptedPrompt,
          prompt_encrypted: true,
          userId: 'user123'
        }),
        ['prompt'],
        mockKey
      );
      
      // Verify encryption was called for response
      expect(require('../utils/crypto').encryptFields).toHaveBeenCalled();
      expect(res.body._encryption).toBeDefined();
    });
  });

  describe('testEncryption middleware', () => {
    beforeEach(() => {
      app.use(testEncryption());
      app.post('/encryption-test', (req, res) => {
        // This should be handled by the middleware
        res.json({ error: 'Should not reach here' });
      });
      app.post('/other', (req, res) => res.json({ success: true }));
    });

    it('should handle encryption test endpoint', async () => {
      const res = await request(app)
        .post('/encryption-test')
        .send({ testData: 'test message' });

      expect(res.status).toBe(200);
      expect(res.body.original).toBe('test message');
      expect(res.body.encrypted).toBeDefined();
      expect(res.body.success).toBe(true);
    });

    it('should use default test data when none provided', async () => {
      const res = await request(app)
        .post('/encryption-test')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.original).toBe('Hello, encryption!');
    });

    it('should pass through other endpoints', async () => {
      const res = await request(app)
        .post('/other')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should handle encryption test errors', async () => {
      require('../utils/crypto').encryptFields.mockImplementation(() => {
        throw new Error('Test encryption failed');
      });

      const res = await request(app)
        .post('/encryption-test')
        .send({ testData: 'test' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Encryption test failed');
    });
  });

  describe('ENCRYPTION_CONFIG', () => {
    it('should have correct configuration structure', () => {
      expect(ENCRYPTION_CONFIG).toBeDefined();
      expect(ENCRYPTION_CONFIG['/chat']).toBeDefined();
      expect(ENCRYPTION_CONFIG['/chat'].request).toContain('prompt');
      expect(ENCRYPTION_CONFIG['/chat'].response).toContain('audio');
      
      expect(ENCRYPTION_CONFIG['/session/endSession']).toBeDefined();
      expect(ENCRYPTION_CONFIG['/session/endSession'].response).toContain('chatlog');
    });
  });

  describe('Error scenarios', () => {
    it('should handle missing encryption key gracefully', async () => {
      require('../utils/crypto').getEncryptionKey.mockReturnValue(null);
      
      app.use(decryptRequest('/chat'));
      app.post('/chat', (req, res) => res.json(req.body));

      const res = await request(app)
        .post('/chat')
        .set('x-encryption-enabled', 'true')
        .send({ prompt: 'test' });

      expect(res.status).toBe(200); // Should proceed without encryption
    });

    it('should handle missing request body', async () => {
      app.use(decryptRequest('/chat'));
      app.post('/chat', (req, res) => res.json({ received: 'no body' }));

      const res = await request(app)
        .post('/chat')
        .set('x-encryption-enabled', 'true');

      expect(res.status).toBe(200);
    });
  });
});
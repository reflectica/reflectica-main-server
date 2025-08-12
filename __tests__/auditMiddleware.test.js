const request = require('supertest');
const express = require('express');
const { auditMiddleware, auditPHIAccess } = require('../middleware/auditMiddleware');

// Mock the audit logger
jest.mock('../utils/auditLogger', () => ({
  logEvent: jest.fn()
}));

const auditLogger = require('../utils/auditLogger');

describe('AuditMiddleware', () => {
  let app;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
    jest.clearAllMocks();
  });

  describe('auditMiddleware', () => {
    it('should log successful request with all audit fields', async () => {
      app.post('/test', auditMiddleware('CREATE'), (req, res) => {
        res.status(200).json({ success: true });
      });

      auditLogger.logEvent.mockResolvedValue('audit123');

      await request(app)
        .post('/test')
        .send({ 
          userId: 'user123', 
          sessionId: 'session456',
          therapyMode: 'mode1' 
        })
        .set('User-Agent', 'test-agent')
        .expect(200);

      expect(auditLogger.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          action: 'CREATE',
          resource: '/test',
          result: 'SUCCESS',
          requestId: expect.any(String),
          ipAddress: expect.any(String),
          userAgent: 'test-agent',
          metadata: expect.objectContaining({
            method: 'POST',
            sessionId: 'session456',
            therapyMode: 'mode1',
            statusCode: 200,
            duration: expect.any(Number)
          })
        })
      );
    });

    it('should log failed request with error status', async () => {
      app.post('/test', auditMiddleware('READ'), (req, res) => {
        res.status(400).json({ error: 'Bad request' });
      });

      auditLogger.logEvent.mockResolvedValue('audit123');

      await request(app)
        .post('/test')
        .send({ userId: 'user123' })
        .expect(400);

      expect(auditLogger.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'FAILURE',
          metadata: expect.objectContaining({
            statusCode: 400
          })
        })
      );
    });

    it('should handle missing userId gracefully', async () => {
      app.get('/test', auditMiddleware('READ'), (req, res) => {
        res.status(200).json({ data: 'test' });
      });

      auditLogger.logEvent.mockResolvedValue('audit123');

      await request(app)
        .get('/test')
        .expect(200);

      expect(auditLogger.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: null
        })
      );
    });

    it('should extract userId from query parameters', async () => {
      app.get('/test', auditMiddleware('READ'), (req, res) => {
        res.status(200).json({ data: 'test' });
      });

      auditLogger.logEvent.mockResolvedValue('audit123');

      await request(app)
        .get('/test?userId=queryUser123')
        .expect(200);

      expect(auditLogger.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'queryUser123'
        })
      );
    });

    it('should include safe metadata fields only', async () => {
      app.post('/test', auditMiddleware('CREATE'), (req, res) => {
        res.status(200).json({ success: true });
      });

      auditLogger.logEvent.mockResolvedValue('audit123');

      await request(app)
        .post('/test')
        .send({ 
          userId: 'user123',
          sessionId: 'session456',
          therapyMode: 'mode1',
          language: 'en',
          sessionType: 'therapy',
          // These should NOT be included in metadata (PHI)
          prompt: 'This is sensitive patient data',
          chatlog: 'Patient conversation',
          personalInfo: 'Sensitive data'
        })
        .expect(200);

      const loggedMetadata = auditLogger.logEvent.mock.calls[0][0].metadata;
      
      expect(loggedMetadata).toEqual(
        expect.objectContaining({
          method: 'POST',
          sessionId: 'session456',
          therapyMode: 'mode1',
          language: 'en',
          sessionType: 'therapy',
          statusCode: 200,
          duration: expect.any(Number)
        })
      );

      // Ensure PHI is NOT included
      expect(loggedMetadata.prompt).toBeUndefined();
      expect(loggedMetadata.chatlog).toBeUndefined();
      expect(loggedMetadata.personalInfo).toBeUndefined();
    });

    it('should add unique requestId to request object', async () => {
      let capturedReq;
      
      app.post('/test', auditMiddleware('CREATE'), (req, res) => {
        capturedReq = req;
        res.status(200).json({ success: true });
      });

      await request(app)
        .post('/test')
        .send({ userId: 'user123' })
        .expect(200);

      expect(capturedReq.requestId).toBeDefined();
      expect(typeof capturedReq.requestId).toBe('string');
      expect(capturedReq.requestId.length).toBeGreaterThan(0);
    });
  });

  describe('auditPHIAccess', () => {
    it('should use READ action by default', async () => {
      app.get('/test', auditPHIAccess, (req, res) => {
        res.status(200).json({ data: 'test' });
      });

      auditLogger.logEvent.mockResolvedValue('audit123');

      await request(app)
        .get('/test')
        .query({ userId: 'user123' })
        .expect(200);

      expect(auditLogger.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'READ'
        })
      );
    });
  });
});
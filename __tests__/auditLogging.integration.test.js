const request = require('supertest');
const express = require('express');
const { auditPHIAccess } = require('../middleware/auditMiddleware');

// Mock the audit logger
jest.mock('../utils/auditLogger', () => ({
  logEvent: jest.fn()
}));

const auditLogger = require('../utils/auditLogger');

describe('Integration Test - Audit Logging', () => {
  let app;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
    jest.clearAllMocks();
  });

  it('should demonstrate end-to-end audit logging for PHI route', async () => {
    // Create a mock PHI route similar to actual application routes
    app.post('/mock-phi', auditPHIAccess, (req, res) => {
      const { userId } = req.body;
      
      // Simulate PHI data retrieval (without exposing actual PHI in logs)
      const mockPHIData = {
        userId: userId,
        sessionCount: 5,
        lastAccess: new Date().toISOString()
      };
      
      res.status(200).json(mockPHIData);
    });

    auditLogger.logEvent.mockResolvedValue('audit-123');

    // Make request to PHI route
    await request(app)
      .post('/mock-phi')
      .send({ 
        userId: 'test-user-123',
        sessionId: 'session-456'
      })
      .set('User-Agent', 'Test-Client/1.0')
      .expect(200);

    // Verify audit log was created with correct information
    expect(auditLogger.logEvent).toHaveBeenCalledTimes(1);
    
    const auditCall = auditLogger.logEvent.mock.calls[0][0];
    
    // Verify all required audit fields are present
    expect(auditCall).toEqual(
      expect.objectContaining({
        userId: 'test-user-123',
        action: 'READ',
        resource: '/mock-phi',
        result: 'SUCCESS',
        requestId: expect.any(String),
        ipAddress: expect.any(String),
        userAgent: 'Test-Client/1.0',
        metadata: expect.objectContaining({
          method: 'POST',
          sessionId: 'session-456',
          statusCode: 200,
          duration: expect.any(Number)
        })
      })
    );

    // Verify no PHI data leaked into audit logs
    expect(auditCall.metadata.sessionCount).toBeUndefined();
    expect(auditCall.metadata.lastAccess).toBeUndefined();
    
    console.log('✓ Audit logging integration test passed');
    console.log('✓ All required audit fields captured');
    console.log('✓ PHI data excluded from audit logs');
    console.log('✓ Request ID generated:', auditCall.requestId);
  });

  it('should audit failed requests', async () => {
    app.post('/mock-phi-fail', auditPHIAccess, (req, res) => {
      res.status(400).json({ error: 'Bad request' });
    });

    auditLogger.logEvent.mockResolvedValue('audit-456');

    await request(app)
      .post('/mock-phi-fail')
      .send({ userId: 'test-user-456' })
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
});
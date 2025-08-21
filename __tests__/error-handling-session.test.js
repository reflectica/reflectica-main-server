const request = require('supertest');
const express = require('express');
const route = require('../routes/session-routes');
const { getAllUserSessions } = require('../controllers/user-controllers');
const { getTexts } = require('../controllers/text-controllers');

// Mock external dependencies
jest.mock('../controllers/user-controllers');
jest.mock('../controllers/text-controllers');
jest.mock('../config/openAi');
jest.mock('../utils/text');
jest.mock('../config/pinecone');
jest.mock('../controllers/summary-controller');

const app = express();
app.use(express.json());
app.use('/session', route);

// Mock global error handler middleware
app.use((error, req, res, next) => {
  console.error('Test error handler:', error.message);
  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    }
  });
});

describe('Session Routes - Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /session/getAllSessions', () => {
    it('should validate required userId field', async () => {
      const res = await request(app)
        .post('/session/getAllSessions')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('userId');
    });

    it('should handle database errors', async () => {
      getAllUserSessions.mockRejectedValue(new Error('Database connection failed'));

      const res = await request(app)
        .post('/session/getAllSessions')
        .send({ userId: 'user1' });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DATABASE_ERROR');
    });

    it('should return success with valid data', async () => {
      const mockSessions = { summaryData: [{ sessionId: '1' }], totalSessions: 1 };
      getAllUserSessions.mockResolvedValue(mockSessions);

      const res = await request(app)
        .post('/session/getAllSessions')
        .send({ userId: 'user1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sessions).toEqual(mockSessions);
    });
  });

  describe('POST /session/endSession', () => {
    it('should validate all required fields', async () => {
      const res = await request(app)
        .post('/session/endSession')
        .send({ userId: 'user1' }); // Missing sessionId, language, sessionType

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Missing required fields');
    });

    it('should handle session not found', async () => {
      getTexts.mockResolvedValue(null);

      const res = await request(app)
        .post('/session/endSession')
        .send({
          userId: 'user1',
          sessionId: 'nonexistent',
          language: 'en',
          sessionType: 'individual'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
    });

    it('should handle empty session data', async () => {
      getTexts.mockResolvedValue({ chatlog: [] });

      const res = await request(app)
        .post('/session/endSession')
        .send({
          userId: 'user1',
          sessionId: 'session1',
          language: 'en',
          sessionType: 'individual'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NO_USER_MESSAGES');
    });
  });
});
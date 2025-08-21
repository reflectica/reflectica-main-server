const request = require('supertest');
const express = require('express');

// Mock external dependencies before importing modules
jest.mock('../controllers/user-controllers');
jest.mock('../controllers/text-controllers');
jest.mock('../config/openAi', () => require('./__mocks__/config/openAi'));
jest.mock('../utils/text');
jest.mock('../config/pinecone', () => require('./__mocks__/config/pinecone'));
jest.mock('../controllers/summary-controller');
jest.mock('../config/connection', () => require('./__mocks__/config/connection'));

const route = require('../routes/session-routes');
const { getAllUserSessions } = require('../controllers/user-controllers');
const { getTexts, getTextFromSummaryTable } = require('../controllers/text-controllers');
const { sessionTextsRef } = require('../config/connection');

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

describe('Session Management Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /session/createSession', () => {
    it('should create a new session and return session ID', async () => {
      const res = await request(app)
        .post('/session/createSession')
        .send({ userId: 'user1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sessionId).toMatch(/^session_\d+_[a-f0-9]{16}$/);
      expect(res.body.message).toBe('Session created successfully');
    });

    it('should validate required userId field', async () => {
      const res = await request(app)
        .post('/session/createSession')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('userId');
    });
  });

  describe('POST /session/validateSession', () => {
    beforeEach(() => {
      // Mock sessionTextsRef methods
      sessionTextsRef.where = jest.fn().mockReturnThis();
      sessionTextsRef.limit = jest.fn().mockReturnThis();
      sessionTextsRef.get = jest.fn();
    });

    it('should validate a valid session', async () => {
      const mockQuerySnapshot = {
        empty: false,
        forEach: jest.fn(callback => {
          callback({
            data: () => ({
              chatlog: [{ role: 'user', content: 'test' }],
              time: new Date().toISOString()
            })
          });
        })
      };
      
      sessionTextsRef.get.mockResolvedValue(mockQuerySnapshot);

      const res = await request(app)
        .post('/session/validateSession')
        .send({ 
          userId: 'user1', 
          sessionId: 'session_1234567890_abcdef1234567890' 
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.valid).toBe(true);
      expect(res.body.stats).toBeDefined();
    });

    it('should reject invalid session ID format', async () => {
      const res = await request(app)
        .post('/session/validateSession')
        .send({ 
          userId: 'user1', 
          sessionId: 'invalid-session-id!' 
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_SESSION_ID');
    });

    it('should deny access for unauthorized session', async () => {
      const mockQuerySnapshot = {
        empty: true
      };
      
      sessionTextsRef.get.mockResolvedValue(mockQuerySnapshot);

      const res = await request(app)
        .post('/session/validateSession')
        .send({ 
          userId: 'user1', 
          sessionId: 'session_1234567890_abcdef1234567890' 
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('SESSION_ACCESS_DENIED');
    });
  });

  describe('POST /session/cleanupSessions', () => {
    beforeEach(() => {
      sessionTextsRef.where = jest.fn().mockReturnThis();
      sessionTextsRef.get = jest.fn();
      sessionTextsRef.firestore = {
        batch: jest.fn(() => ({
          delete: jest.fn(),
          commit: jest.fn().mockResolvedValue()
        }))
      };
    });

    it('should cleanup old sessions', async () => {
      const mockQuerySnapshot = {
        empty: false,
        forEach: jest.fn(callback => {
          callback({ ref: 'doc1' });
          callback({ ref: 'doc2' });
        })
      };
      
      sessionTextsRef.get.mockResolvedValue(mockQuerySnapshot);

      const res = await request(app)
        .post('/session/cleanupSessions')
        .send({ 
          userId: 'user1',
          maxAge: 24 
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cleanedSessions).toBe(2);
    });

    it('should handle no sessions to cleanup', async () => {
      const mockQuerySnapshot = {
        empty: true
      };
      
      sessionTextsRef.get.mockResolvedValue(mockQuerySnapshot);

      const res = await request(app)
        .post('/session/cleanupSessions')
        .send({ userId: 'user1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cleanedSessions).toBe(0);
    });
  });

  describe('Session Isolation Tests', () => {
    beforeEach(() => {
      sessionTextsRef.where = jest.fn().mockReturnThis();
      sessionTextsRef.limit = jest.fn().mockReturnThis();
      sessionTextsRef.get = jest.fn();
    });

    it('should prevent access to sessions from different users', async () => {
      const mockQuerySnapshot = {
        empty: true
      };
      
      sessionTextsRef.get.mockResolvedValue(mockQuerySnapshot);

      const res = await request(app)
        .post('/session/validateSession')
        .send({ 
          userId: 'user1', 
          sessionId: 'session_owned_by_user2' 
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('SESSION_ACCESS_DENIED');
    });

    it('should allow concurrent sessions for same user', async () => {
      const mockQuerySnapshot = {
        empty: false,
        forEach: jest.fn(callback => {
          callback({
            data: () => ({
              chatlog: [{ role: 'user', content: 'test' }],
              time: new Date().toISOString()
            })
          });
        })
      };
      
      sessionTextsRef.get.mockResolvedValue(mockQuerySnapshot);

      // Test two different sessions for same user
      const res1 = await request(app)
        .post('/session/validateSession')
        .send({ 
          userId: 'user1', 
          sessionId: 'session_1234567890_abcdef1234567890' 
        });

      const res2 = await request(app)
        .post('/session/validateSession')
        .send({ 
          userId: 'user1', 
          sessionId: 'session_0987654321_fedcba0987654321' 
        });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res2.body.success).toBe(true);
    });
  });

  describe('Session History with Date Range', () => {
    it('should support date range queries', async () => {
      const mockSessions = { 
        summaryData: [{ sessionId: '1', time: '2024-01-15' }], 
        totalSessions: 1 
      };
      getAllUserSessions.mockResolvedValue(mockSessions);

      const res = await request(app)
        .post('/session/getAllSessions')
        .send({ 
          userId: 'user1',
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sessions).toEqual(mockSessions);
      expect(getAllUserSessions).toHaveBeenCalledWith('user1', '2024-01-01', '2024-01-31');
    });

    it('should default to current month when no date range provided', async () => {
      const mockSessions = { 
        summaryData: [], 
        totalSessions: 0 
      };
      getAllUserSessions.mockResolvedValue(mockSessions);

      const res = await request(app)
        .post('/session/getAllSessions')
        .send({ userId: 'user1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(getAllUserSessions).toHaveBeenCalledWith('user1', undefined, undefined);
    });
  });
});
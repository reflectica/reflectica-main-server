const request = require('supertest');
const express = require('express');

// Mock all external dependencies
jest.mock('../config/connection', () => ({
  admin: {
    auth: () => ({
      verifyIdToken: jest.fn()
    })
  }
}));

jest.mock('../controllers/user-controllers', () => ({
  updateFieldInUserCollection: jest.fn(),
  emailAllUserTranscripts: jest.fn(),
  deleteAllUserSummaries: jest.fn(),
  getAllUserSessions: jest.fn(),
  getSentiment: jest.fn(),
  userEmotions: jest.fn(),
  parseScores: jest.fn(),
  calculateMentalHealthScore: jest.fn(),
  normalizeScores: jest.fn()
}));

jest.mock('../controllers/text-controllers', () => ({
  addTextData: jest.fn(),
  getTexts: jest.fn(),
  getTextsSeperated: jest.fn(),
  getTextFromSummaryTable: jest.fn(),
  deleteAllTexts: jest.fn()
}));

jest.mock('../controllers/dashboard-controllers', () => ({
  getDashboardData: jest.fn()
}));

jest.mock('../config/openAi', () => ({
  callAI: jest.fn(),
  callOpenAi: jest.fn(),
  createEmbeddings: jest.fn()
}));

jest.mock('../config/pinecone', () => ({
  upsertChunksWithEmbeddings: jest.fn()
}));

jest.mock('../controllers/summary-controller', () => ({
  registerSummary: jest.fn()
}));

jest.mock('../utils/text', () => ({
  askForShortSummary: [],
  askForin5LongSummary: [],
  askForin3LongSummary: [],
  askForUserProfile: [],
  askForDSMScores: [],
  askForDSMScoresSpanish: [],
  englishToSpanish: []
}));

jest.mock('../utils/mood', () => ({
  moodTable: {}
}));

const { admin } = require('../config/connection');

describe('Route Authentication', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Import routes after mocking dependencies
    const userRoutes = require('../routes/user-routes');
    const sessionRoutes = require('../routes/session-routes');
    const chatRoutes = require('../routes/chat-routes');
    const dashRoutes = require('../routes/dash-routes');
    const audioRoutes = require('../routes/audio-routes');
    
    app.use('/user', userRoutes);
    app.use('/session', sessionRoutes);
    app.use('/chat', chatRoutes);
    app.use('/dashboardData', dashRoutes);
    app.use('/audio', audioRoutes);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const testRoutes = [
    { method: 'post', path: '/user/updateUserField', body: { userId: 'test', value: 'test', fieldName: 'test' } },
    { method: 'post', path: '/user/deleteEverythingForUser', body: { userId: 'test' } },
    { method: 'post', path: '/session/getAllSessions', body: { userId: 'test' } },
    { method: 'post', path: '/session/getSessionTranscripts', body: { userId: 'test', sessionId: 'test' } },
    { method: 'post', path: '/session/endSession', body: { userId: 'test', sessionId: 'test', language: 'en', sessionType: 'test' } },
    { method: 'post', path: '/chat', body: { userId: 'test', prompt: 'test', sessionId: 'test', therapyMode: 'test', sessionType: 'test' } },
    { method: 'post', path: '/dashboardData', body: { userId: 'test' } },
    { method: 'post', path: '/audio/transcript', body: { userId: 'test', sessionId: 'test', role: 'user', message: 'test' } }
  ];

  describe('Unauthenticated requests', () => {
    testRoutes.forEach(({ method, path, body }) => {
      it(`should return 401 for ${method.toUpperCase()} ${path} without auth`, async () => {
        const res = await request(app)[method](path).send(body);
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Authorization header with Bearer token required');
      });
    });
  });

  describe('Invalid token requests', () => {
    beforeEach(() => {
      admin.auth().verifyIdToken.mockRejectedValue(new Error('Invalid token'));
    });

    testRoutes.forEach(({ method, path, body }) => {
      it(`should return 401 for ${method.toUpperCase()} ${path} with invalid token`, async () => {
        const res = await request(app)[method](path)
          .set('Authorization', 'Bearer invalid-token')
          .send(body);
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Invalid or expired token');
      });
    });
  });

  describe('Unauthorized access attempts', () => {
    beforeEach(() => {
      admin.auth().verifyIdToken.mockResolvedValue({
        uid: 'different-user',
        email: 'other@example.com',
        email_verified: true
      });
    });

    testRoutes.forEach(({ method, path, body }) => {
      it(`should return 403 for ${method.toUpperCase()} ${path} when accessing other user's data`, async () => {
        const res = await request(app)[method](path)
          .set('Authorization', 'Bearer valid-token')
          .send(body);
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('Access denied: insufficient permissions');
      });
    });
  });

  describe('Authorized requests', () => {
    beforeEach(() => {
      admin.auth().verifyIdToken.mockResolvedValue({
        uid: 'test',
        email: 'test@example.com',
        email_verified: true
      });
    });

    it('should allow authenticated user to access their own data', async () => {
      const res = await request(app)
        .post('/user/updateUserField')
        .set('Authorization', 'Bearer valid-token')
        .send({ userId: 'test', value: 'test', fieldName: 'test' });
      
      // Should not return 401 or 403
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });
});
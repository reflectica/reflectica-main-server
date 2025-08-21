const request = require('supertest');
const express = require('express');

// Import routes
const sessionRoutes = require('../routes/session-routes');
const chatRoutes = require('../routes/chat-routes');
const audioRoutes = require('../routes/audio-routes');

// Mock dependencies
jest.mock('../controllers/user-controllers');
jest.mock('../controllers/text-controllers');
jest.mock('../config/openAi');
jest.mock('../utils/text', () => ({
  englishToSpanish: jest.fn(),
  askForShortSummary: 'short summary prompt',
  askForin5LongSummary: 'long summary prompt',
  askForin3LongSummary: 'short long summary prompt', 
  askForUserProfile: 'user profile prompt',
  askForDSMScores: 'dsm scores prompt',
  askForDSMScoresSpanish: 'dsm scores spanish prompt'
}));
jest.mock('../utils/mood', () => ({
  moodTable: { '0': 50 }
}));
jest.mock('../config/pinecone');
jest.mock('../controllers/summary-controller');

const app = express();
app.use(express.json());
app.use('/session', sessionRoutes);
app.use('/chat', chatRoutes);
app.use('/audio', audioRoutes);

const { getAllUserSessions, userEmotions, getSentiment } = require('../controllers/user-controllers');
const { getTexts, getTextFromSummaryTable, deleteAllTexts, addTextData } = require('../controllers/text-controllers');
const { callAI } = require('../config/openAi');

describe('Error Handling Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Session Routes Error Handling', () => {
    it('should return 400 for missing userId in getAllSessions', async () => {
      const res = await request(app)
        .post('/session/getAllSessions')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('User ID is required');
      expect(res.body.message).toContain('valid user ID');
    });

    it('should return 400 for missing parameters in getSessionTranscripts', async () => {
      const res = await request(app)
        .post('/session/getSessionTranscripts')
        .send({ userId: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing required parameters');
    });

    it('should return 404 when session data is not found', async () => {
      getTexts.mockResolvedValue(null);

      const res = await request(app)
        .post('/session/endSession')
        .send({
          userId: 'user1',
          sessionId: 'session1',
          language: 'en'
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Session not found');
    });

    it('should handle database errors gracefully', async () => {
      getAllUserSessions.mockRejectedValue(new Error('Database connection failed'));

      const res = await request(app)
        .post('/session/getAllSessions')
        .send({ userId: 'user1' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to retrieve sessions');
      expect(res.body.message).toContain('try again later');
    });
  });

  describe('Chat Routes Error Handling', () => {
    it('should return 400 for missing required parameters', async () => {
      const res = await request(app)
        .post('/chat')
        .send({ therapyMode: 'CBT' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing required parameters');
    });

    it('should handle network errors with specific message', async () => {
      addTextData.mockResolvedValue();
      getTexts.mockResolvedValue({ chatlog: [] });
      const { getTextsSeperated } = require('../controllers/text-controllers');
      getTextsSeperated.mockResolvedValue({ userLogs: [], aiLogs: [] });
      
      const networkError = new Error('Connection failed');
      networkError.code = 'ENOTFOUND';
      callAI.mockRejectedValue(networkError);

      const res = await request(app)
        .post('/chat')
        .send({
          prompt: 'Hello',
          userId: 'user1',
          sessionId: 'session1',
          therapyMode: 'CBT'
        });

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('Network connection failed');
      expect(res.body.message).toContain('internet connection');
    });

    it('should handle rate limit errors', async () => {
      addTextData.mockResolvedValue();
      getTexts.mockResolvedValue({ chatlog: [] });
      const { getTextsSeperated } = require('../controllers/text-controllers');
      getTextsSeperated.mockResolvedValue({ userLogs: [], aiLogs: [] });
      
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.status = 429;
      callAI.mockRejectedValue(rateLimitError);

      const res = await request(app)
        .post('/chat')
        .send({
          prompt: 'Hello',
          userId: 'user1',
          sessionId: 'session1',
          therapyMode: 'CBT'
        });

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Service temporarily unavailable');
    });
  });

  describe('Audio Routes Error Handling', () => {
    it('should return 400 for missing parameters in transcript', async () => {
      const res = await request(app)
        .post('/audio/transcript')
        .send({ userId: 'user1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing required parameters');
    });

    it('should return 400 for invalid role in transcript', async () => {
      const res = await request(app)
        .post('/audio/transcript')
        .send({
          userId: 'user1',
          sessionId: 'session1',
          role: 'invalid',
          message: 'test'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid role');
    });

    it('should return 400 for missing parameters in openai-proxy', async () => {
      const res = await request(app)
        .post('/audio/openai-proxy')
        .send({ model: 'gpt-4' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing required parameters');
    });
  });

  describe('Fallback Behavior', () => {
    it('should continue processing even when some AI calls fail', async () => {
      // Mock successful basic calls
      getTexts.mockResolvedValue({
        chatlog: [{ role: 'user', content: 'Hello' }]
      });
      getSentiment.mockResolvedValue(0);
      deleteAllTexts.mockResolvedValue();
      
      // Mock some AI calls to fail
      const { callOpenAi } = require('../config/openAi');
      callOpenAi.mockImplementation((prompt) => {
        // Check if this is the short summary call by looking at the prompt structure
        if (Array.isArray(prompt) && prompt.some(p => typeof p === 'string' && p.includes('short summary'))) {
          throw new Error('AI service unavailable');
        }
        return Promise.resolve('AI response');
      });

      userEmotions.mockRejectedValue(new Error('Emotion service down'));
      
      const { parseScores, normalizeScores, calculateMentalHealthScore } = require('../controllers/user-controllers');
      parseScores.mockReturnValue({});
      normalizeScores.mockReturnValue({});
      calculateMentalHealthScore.mockReturnValue(0);
      
      const { registerSummary } = require('../controllers/summary-controller');
      registerSummary.mockResolvedValue();

      const res = await request(app)
        .post('/session/endSession')
        .send({
          userId: 'user1',
          sessionId: 'session1',
          language: 'en'
        });

      expect(res.status).toBe(200);
      expect(res.body.shortSummary).toBe('Session summary unavailable - processing error occurred.');
      expect(res.body.emotions).toEqual({ error: 'Emotion analysis unavailable' });
    });
  });
});
const request = require('supertest');
const express = require('express');

// Mock external dependencies before importing modules
jest.mock('../controllers/user-controllers', () => require('./__mocks__/controllers/user-controllers'));
jest.mock('../controllers/text-controllers', () => require('./__mocks__/controllers/text-controllers'));
jest.mock('../config/openAi', () => require('./__mocks__/config/openAi'));
jest.mock('../utils/text', () => ({
  ...require('./__mocks__/utils/text'),
  englishToSpanish: jest.fn()
}));
jest.mock('../config/pinecone', () => require('./__mocks__/config/pinecone'));
jest.mock('../controllers/summary-controller', () => require('./__mocks__/controllers/summary-controller'));
jest.mock('../config/connection', () => require('./__mocks__/config/connection'));

const route = require('../routes/session-routes');
const { getAllUserSessions, parseScores, calculateMentalHealthScore, normalizeScores } = require('../controllers/user-controllers');
const { getTexts, getTextFromSummaryTable } = require('../controllers/text-controllers');
const { callOpenAi } = require('../config/openAi');
const { englishToSpanish } = require('../utils/text');
const { upsertChunksWithEmbeddings } = require('../config/pinecone');
const { registerSummary } = require('../controllers/summary-controller');

const app = express();
app.use(express.json());
app.use('/session', route);

let server;

beforeAll((done) => {
  server = app.listen(done);
});

afterAll((done) => {
  server.close(done);
});

jest.setTimeout(10000); // Set global timeout to 10 seconds

describe('Session Routes', () => {
  it('should return all sessions for a user', async () => {
    const mockSessions = [{ sessionId: '1', name: 'Session 1' }];
    getAllUserSessions.mockResolvedValue(mockSessions);

    const res = await request(app)
      .post('/session/getAllSessions')
      .send({ userId: 'user1' });

    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual(mockSessions);
  });

  it('should return session transcripts', async () => {
    const mockTranscripts = { sessionId: '1', transcripts: 'Transcript data' };
    getTextFromSummaryTable.mockResolvedValue(mockTranscripts);
    
    // Mock session validation
    const { sessionTextsRef } = require('../config/connection');
    sessionTextsRef.where.mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            empty: false
          })
        })
      })
    });

    const res = await request(app)
      .post('/session/getSessionTranscripts')
      .send({ sessionId: 'session_1234567890_abcdef1234567890', userId: 'user1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual(mockTranscripts);
  });

  it('should end session and return processed data', async () => {
    const sessionId = 'session_1234567890_abcdef1234567890';
    const mockTexts = {
      chatlog: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ]
    };
    const mockEnglishTranscript = 'Hello Hi there!';

    getTexts.mockResolvedValue(mockTexts);
    englishToSpanish.mockResolvedValue(mockEnglishTranscript);
    callOpenAi.mockResolvedValue(mockEnglishTranscript);
    parseScores.mockReturnValue([1, 2, 3]);
    normalizeScores.mockReturnValue([0.1, 0.2, 0.3]);
    calculateMentalHealthScore.mockReturnValue(0.6);
    upsertChunksWithEmbeddings.mockResolvedValue();
    registerSummary.mockResolvedValue();

    // Mock session validation
    const { sessionTextsRef } = require('../config/connection');
    sessionTextsRef.where.mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            empty: false
          })
        })
      })
    });

    const res = await request(app)
      .post('/session/endSession')
      .send({
        userId: 'user1',
        sessionId: sessionId,
        language: 'en',
        sessionType: 'type1'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.chatlog).toEqual(mockTexts.chatlog);
    expect(res.body.data.sessionId).toBe(sessionId);
  });

  it('should return 500 if there is an error', async () => {
    getTexts.mockRejectedValue(new Error('Test error'));

    const res = await request(app)
      .post('/session/endSession')
      .send({
        userId: 'user1',
        sessionId: 'session_1234567890_abcdef1234567890',
        language: 'en',
        sessionType: 'type1'
      });

    expect(res.status).toBe(500);
  });
});
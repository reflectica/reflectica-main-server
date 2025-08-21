const request = require('supertest');
const express = require('express');
const route = require('../routes/session-routes');
const { getAllUserSessions, parseScores, calculateMentalHealthScore, normalizeScores, userEmotions, getSentiment } = require('../controllers/user-controllers');
const { getTexts, getTextFromSummaryTable, deleteAllTexts } = require('../controllers/text-controllers');
const { callOpenAi } = require('../config/openAi');
const { englishToSpanish } = require('../utils/text');
const { upsertChunksWithEmbeddings } = require('../config/pinecone');
const { registerSummary } = require('../controllers/summary-controller');

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

    const res = await request(app)
      .post('/session/getSessionTranscripts')
      .send({ sessionId: '1', userId: 'user1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockTranscripts);
  });

  it('should end session and return processed data', async () => {
    const mockTexts = {
      chatlog: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ]
    };
    const mockEnglishTranscript = 'Hello Hi there!';
    const mockQueryData = { inputs: 'Hello' };
    const mockQueryEmotions = { text: 'Hello' };
    const mockQuerySpanish = { text: mockEnglishTranscript };

    getTexts.mockResolvedValue(mockTexts);
    englishToSpanish.mockResolvedValue(mockEnglishTranscript);
    callOpenAi.mockResolvedValue(mockEnglishTranscript);
    parseScores.mockReturnValue([1, 2, 3]);
    normalizeScores.mockReturnValue([0.1, 0.2, 0.3]);
    calculateMentalHealthScore.mockReturnValue(0.6);
    userEmotions.mockResolvedValue(mockEnglishTranscript);
    getSentiment.mockResolvedValue(0);
    deleteAllTexts.mockResolvedValue();
    upsertChunksWithEmbeddings.mockResolvedValue();
    registerSummary.mockResolvedValue();

    const res = await request(app)
      .post('/session/endSession')
      .send({
        userId: 'user1',
        sessionId: '1',
        language: 'en',
        sessionType: 'type1'
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      chatlog: mockTexts.chatlog,
      shortSummary: mockEnglishTranscript,
      longSummary: mockEnglishTranscript,
      sessionId: '1',
      mood: 50,
      emotions: mockEnglishTranscript, // userEmotions mock returns the input
      rawScores: [1, 2, 3],
      normalizedScores: [0.1, 0.2, 0.3],
      mentalHealthScore: '0.60',
      referral: mockEnglishTranscript // callOpenAi mock returns the input
    });
  });

  it('should return 500 if there is an error', async () => {
    getTexts.mockRejectedValue(new Error('Test error'));

    const res = await request(app)
      .post('/session/endSession')
      .send({
        userId: 'user1',
        sessionId: '1',
        language: 'en',
        sessionType: 'type1'
      });

    expect(res.status).toBe(500);
  });
});
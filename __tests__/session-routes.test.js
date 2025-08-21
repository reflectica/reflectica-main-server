const request = require('supertest');
const express = require('express');
const route = require('../routes/session-routes');
const { getAllUserSessions, parseScores, calculateMentalHealthScore, normalizeScores, getSentiment, userEmotions } = require('../controllers/user-controllers');
const { getTexts, getTextFromSummaryTable, deleteAllTexts } = require('../controllers/text-controllers');
const { callOpenAi } = require('../config/openAi');
const { englishToSpanish } = require('../utils/text');
const { upsertChunksWithEmbeddings } = require('../config/pinecone');
const { registerSummary } = require('../controllers/summary-controller');
const { moodTable } = require('../utils/mood');

jest.mock('../controllers/user-controllers');
jest.mock('../controllers/text-controllers');
jest.mock('../config/openAi');
jest.mock('../utils/text', () => ({
  englishToSpanish: jest.fn(),
  askForShortSummary: [],
  askForUserProfile: [],
  askForDSMScores: [],
  askForDSMScoresSpanish: [],
  askForin5LongSummary: [],
  askForin3LongSummary: []
}));
jest.mock('../config/pinecone');
jest.mock('../controllers/summary-controller');
jest.mock('../utils/mood', () => ({
  moodTable: { '0': 50 }
}));

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
    const mockEmotions = { emotions: 'happy' };

    getTexts.mockResolvedValue(mockTexts);
    getSentiment.mockResolvedValue(0);
    englishToSpanish.mockResolvedValue(mockEnglishTranscript);
    callOpenAi.mockResolvedValue(mockEnglishTranscript);
    userEmotions.mockResolvedValue(mockEmotions);
    parseScores.mockReturnValue([1, 2, 3]);
    normalizeScores.mockReturnValue([0.1, 0.2, 0.3]);
    calculateMentalHealthScore.mockReturnValue(0.6);
    upsertChunksWithEmbeddings.mockResolvedValue();
    registerSummary.mockResolvedValue();
    deleteAllTexts.mockResolvedValue();

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
      emotions: mockEmotions,
      rawScores: [1, 2, 3],
      normalizedScores: [0.1, 0.2, 0.3],
      mentalHealthScore: '0.60',
      referral: mockEnglishTranscript
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
    expect(res.body.error).toBe('Unable to retrieve session data');
    expect(res.body.message).toBe('There was an issue retrieving your session data. Please try again later.');
  });

  it('should return 400 if missing required parameters', async () => {
    const res = await request(app)
      .post('/session/endSession')
      .send({
        language: 'en',
        sessionType: 'type1'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required parameters');
    expect(res.body.message).toBe('User ID and session ID are required to end a session.');
  });

  it('should return 404 if session not found', async () => {
    getTexts.mockResolvedValue(null);

    const res = await request(app)
      .post('/session/endSession')
      .send({
        userId: 'user1',
        sessionId: '1',
        language: 'en',
        sessionType: 'type1'
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Session not found');
    expect(res.body.message).toBe('No session data found for the provided session ID.');
  });

  it('should return 400 if userId is missing for getAllSessions', async () => {
    const res = await request(app)
      .post('/session/getAllSessions')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('User ID is required');
    expect(res.body.message).toBe('Please provide a valid user ID to retrieve sessions.');
  });

  it('should return 404 if transcripts not found', async () => {
    getTextFromSummaryTable.mockResolvedValue(null);

    const res = await request(app)
      .post('/session/getSessionTranscripts')
      .send({ sessionId: '1', userId: 'user1' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Transcripts not found');
    expect(res.body.message).toBe('No transcripts found for this session.');
  });
});
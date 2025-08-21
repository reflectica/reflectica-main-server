const request = require('supertest');
const express = require('express');
const route = require('../routes/audio-routes');
const { addTextData } = require('../controllers/text-controllers');

jest.mock('../controllers/text-controllers');

// Mock the fetch function globally
global.fetch = jest.fn();

const app = express();
app.use(express.json());
app.use('/audio', route);

describe('Audio Routes Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle OpenAI API errors gracefully', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    });

    const res = await request(app)
      .get('/audio');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Unable to create audio session');
    expect(res.body.message).toBe('There was an issue setting up the audio session. Please try again later.');
  });

  it('should handle network errors', async () => {
    fetch.mockRejectedValue(new Error('Network error'));

    const res = await request(app)
      .get('/audio');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Audio service unavailable');
    expect(res.body.message).toBe('The audio service is currently unavailable. Please try again later.');
  });

  it('should handle successful OpenAI response', async () => {
    const mockData = { sessionId: 'test-session', token: 'test-token' };
    fetch.mockResolvedValue({
      ok: true,
      json: async () => mockData
    });

    const res = await request(app)
      .get('/audio');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockData);
  });

  it('should return 400 if missing required parameters for transcript', async () => {
    const res = await request(app)
      .post('/audio/transcript')
      .send({
        userId: 'user1',
        sessionId: 'session1'
        // missing role and message
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required parameters');
    expect(res.body.message).toBe('User ID, session ID, role, and message are all required.');
  });

  it('should handle transcript save errors', async () => {
    addTextData.mockRejectedValue(new Error('Database error'));

    const res = await request(app)
      .post('/audio/transcript')
      .send({
        userId: 'user1',
        sessionId: 'session1',
        role: 'user',
        message: 'Hello'
      });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Unable to save transcript');
    expect(res.body.message).toBe('There was an issue saving the transcript. Please try again.');
  });

  it('should successfully save transcript', async () => {
    addTextData.mockResolvedValue();

    const res = await request(app)
      .post('/audio/transcript')
      .send({
        userId: 'user1',
        sessionId: 'session1',
        role: 'user',
        message: 'Hello'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
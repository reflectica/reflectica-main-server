const request = require('supertest');
const express = require('express');
const route = require('../routes/chat-routes');
const { addTextData, getTexts, getTextsSeperated } = require('../controllers/text-controllers');
const { callAI, openai } = require('../config/openAi');

jest.mock('../controllers/text-controllers');
jest.mock('../config/openAi', () => ({
  callAI: jest.fn(),
  openai: {
    audio: {
      speech: {
        create: jest.fn()
      }
    }
  }
}));

const app = express();
app.use(express.json());
app.use('/chat', route);

describe('POST /chat', () => {
  it('should return 400 if therapyMode is missing', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ prompt: 'Hello', userId: 'user1', sessionId: 'session1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing therapyMode parameter.');
  });

  it('should return 200 and audio response if all parameters are provided', async () => {
    addTextData.mockResolvedValue();
    getTexts.mockResolvedValue([]);
    getTextsSeperated.mockResolvedValue({ userLogs: [], aiLogs: [] });
    callAI.mockResolvedValue({ text: 'AI response', audioFile: Buffer.from('audio data').toString('base64') });

    const res = await request(app)
      .post('/chat')
      .send({
        prompt: 'Hello',
        userId: 'user1',
        sessionId: 'session1',
        therapyMode: 'mode1',
        sessionType: 'type1'
      });

    expect(res.status).toBe(200);
    expect(res.body.audio).toBe(Buffer.from('audio data').toString('base64'));
  });

  it('should return 500 if there is an error', async () => {
    addTextData.mockRejectedValue(new Error('Test error'));

    const res = await request(app)
      .post('/chat')
      .send({
        prompt: 'Hello',
        userId: 'user1',
        sessionId: 'session1',
        therapyMode: 'mode1',
        sessionType: 'type1'
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Unable to save message');
    expect(res.body.message).toBe('There was an issue saving your message. Please try again.');
  });

  it('should return 400 if missing required parameters', async () => {
    const res = await request(app)
      .post('/chat')
      .send({
        therapyMode: 'mode1',
        sessionType: 'type1'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required parameters');
    expect(res.body.message).toBe('Please provide prompt, user ID, and session ID to continue the conversation.');
  });

  it('should return 429 for rate limit errors', async () => {
    addTextData.mockResolvedValue();
    getTexts.mockResolvedValue([]);
    getTextsSeperated.mockResolvedValue({ userLogs: [], aiLogs: [] });
    callAI.mockRejectedValue(new Error('rate limit exceeded'));

    const res = await request(app)
      .post('/chat')
      .send({
        prompt: 'Hello',
        userId: 'user1',
        sessionId: 'session1',
        therapyMode: 'mode1',
        sessionType: 'type1'
      });

    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Service temporarily unavailable');
    expect(res.body.message).toBe('Our AI service is currently experiencing high demand. Please try again in a few moments.');
  });

  it('should return 503 for network errors', async () => {
    addTextData.mockResolvedValue();
    getTexts.mockResolvedValue([]);
    getTextsSeperated.mockResolvedValue({ userLogs: [], aiLogs: [] });
    callAI.mockRejectedValue(new Error('network timeout'));

    const res = await request(app)
      .post('/chat')
      .send({
        prompt: 'Hello',
        userId: 'user1',
        sessionId: 'session1',
        therapyMode: 'mode1',
        sessionType: 'type1'
      });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Network error');
    expect(res.body.message).toBe('There was a network issue connecting to our AI service. Please check your connection and try again.');
  });
});
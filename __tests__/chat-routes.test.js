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

  it('should return 400 if required parameters are missing', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ therapyMode: 'mode1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required parameters');
  });

  it('should return 200 and audio response if all parameters are provided', async () => {
    addTextData.mockResolvedValue();
    getTexts.mockResolvedValue([]);
    getTextsSeperated.mockResolvedValue({ userLogs: [], aiLogs: [] });
    callAI.mockResolvedValue({ 
      text: 'AI response',
      audioFile: Buffer.from('audio data').toString('base64')
    });

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
    addTextData.mockResolvedValue();
    getTexts.mockResolvedValue([]);
    getTextsSeperated.mockResolvedValue({ userLogs: [], aiLogs: [] });
    callAI.mockRejectedValue(new Error('AI service error'));

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
    expect(res.body.error).toBe('AI processing failed');
  });
});
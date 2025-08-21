const request = require('supertest');
const express = require('express');

// Mock external dependencies before importing modules
jest.mock('../controllers/text-controllers', () => require('./__mocks__/controllers/text-controllers'));
jest.mock('../config/openAi', () => require('./__mocks__/config/openAi'));
jest.mock('../config/pinecone', () => require('./__mocks__/config/pinecone'));
jest.mock('../config/connection', () => require('./__mocks__/config/connection'));

const route = require('../routes/chat-routes');
const { addTextData, getTexts, getTextsSeperated } = require('../controllers/text-controllers');
const { callAI, openai } = require('../config/openAi');

const app = express();
app.use(express.json());
app.use('/chat', route);

describe('POST /chat', () => {
  it('should return 400 if therapyMode is missing', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ prompt: 'Hello', userId: 'user1', sessionId: 'session1' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Missing required fields');
  });

  it('should return 200 and audio response if all parameters are provided', async () => {
    addTextData.mockResolvedValue();
    getTexts.mockResolvedValue([]);
    getTextsSeperated.mockResolvedValue({ userLogs: [], aiLogs: [] });
    callAI.mockResolvedValue({ text: 'AI response', audioFile: Buffer.from('audio data').toString('base64') });
    
    // Mock session validation
    const { sessionTextsRef } = require('../config/connection');
    sessionTextsRef.where.mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            empty: true // New session, no existing data
          })
        }),
        get: jest.fn().mockResolvedValue({
          empty: true
        })
      })
    });

    const res = await request(app)
      .post('/chat')
      .send({
        prompt: 'Hello',
        userId: 'user1',
        sessionId: 'session_1234567890_abcdef1234567890',
        therapyMode: 'mode1',
        sessionType: 'type1'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.text).toBe('AI response');
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
  });
});
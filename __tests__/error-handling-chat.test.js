const request = require('supertest');
const express = require('express');

// Mock dependencies before importing the route
jest.mock('../config/connection', () => require('./__mocks__/config/connection'));
jest.mock('../config/openAi', () => require('./__mocks__/config/openAi'));
jest.mock('../config/pinecone', () => require('./__mocks__/config/pinecone'));
jest.mock('../controllers/text-controllers', () => require('./__mocks__/controllers/text-controllers'));

const route = require('../routes/chat-routes');
const { addTextData, getTexts, getTextsSeperated } = require('../controllers/text-controllers');
const { callAI } = require('../config/openAi');

const app = express();
app.use(express.json());
app.use('/chat', route);

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

describe('POST /chat - Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should validate required fields and return 400 for missing therapyMode', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ 
        prompt: 'Hello', 
        userId: 'user1', 
        sessionId: 'session1' 
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('therapyMode');
  });

  it('should validate prompt is non-empty string', async () => {
    const res = await request(app)
      .post('/chat')
      .send({
        prompt: '',
        userId: 'user1',
        sessionId: 'session1',
        therapyMode: 'CBT',
        sessionType: 'individual'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('non-empty string');
  });

  it('should handle database errors when saving user message', async () => {
    addTextData.mockRejectedValue(new Error('Database connection failed'));

    const res = await request(app)
      .post('/chat')
      .send({
        prompt: 'Hello',
        userId: 'user1',
        sessionId: 'session1',
        therapyMode: 'CBT',
        sessionType: 'individual'
      });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('DATABASE_ERROR');
  });

  it('should handle AI service errors gracefully', async () => {
    addTextData.mockResolvedValue();
    getTexts.mockResolvedValue({ chatlog: [] });
    getTextsSeperated.mockResolvedValue({ userLogs: [], aiLogs: [] });
    callAI.mockRejectedValue(new Error('OpenAI service unavailable'));

    const res = await request(app)
      .post('/chat')
      .send({
        prompt: 'Hello',
        userId: 'user1',
        sessionId: 'session1',
        therapyMode: 'CBT',
        sessionType: 'individual'
      });

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('EXTERNAL_SERVICE_ERROR');
  });

  it('should return success with valid data', async () => {
    addTextData.mockResolvedValue();
    getTexts.mockResolvedValue({ chatlog: [] });
    getTextsSeperated.mockResolvedValue({ userLogs: [], aiLogs: [] });
    callAI.mockResolvedValue({ 
      text: 'AI response', 
      audioFile: 'audio123' 
    });

    const res = await request(app)
      .post('/chat')
      .send({
        prompt: 'Hello',
        userId: 'user1',
        sessionId: 'session1',
        therapyMode: 'CBT',
        sessionType: 'individual'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.text).toBe('AI response');
    expect(res.body.data.audio).toBe('audio123');
  });
});
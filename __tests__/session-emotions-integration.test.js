const request = require('supertest');
const express = require('express');
const axios = require('axios');

// Mock external dependencies
jest.mock('../config/connection', () => require('./__mocks__/config/connection'));
jest.mock('../controllers/user-controllers');
jest.mock('../controllers/text-controllers', () => require('./__mocks__/controllers/text-controllers'));
jest.mock('../config/openAi', () => require('./__mocks__/config/openAi'));
jest.mock('../utils/text', () => require('./__mocks__/utils/text'));
jest.mock('../config/pinecone', () => require('./__mocks__/config/pinecone'));
jest.mock('../controllers/summary-controller', () => require('./__mocks__/controllers/summary-controller'));
jest.mock('axios');

const route = require('../routes/session-routes');
const { userEmotions } = require('../controllers/user-controllers');
const { getTexts } = require('../controllers/text-controllers');

const app = express();
app.use(express.json());
app.use('/session', route);

// Mock global error handler middleware
app.use((error, req, res, next) => {
  console.error('Integration test error handler:', error.message);
  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    }
  });
});

describe('Session processing with userEmotions fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console logs during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should complete session processing when userEmotions returns fallback response', async () => {
    // Mock session data
    const mockChatlog = [
      { role: 'user', content: 'I feel sad today' },
      { role: 'assistant', content: 'I understand you are feeling sad. Can you tell me more?' },
      { role: 'user', content: 'Yes, I lost my job yesterday' }
    ];

    // Mock the functions to return successful responses
    getTexts.mockResolvedValue({ chatlog: mockChatlog });
    
    // Mock userEmotions to return the fallback response (simulating service failure)
    const fallbackResponse = [
      { "label": "neutral", "score": 1.0 },
      { "label": "sadness", "score": 0.0 },
      { "label": "joy", "score": 0.0 },
      { "label": "anger", "score": 0.0 },
      { "label": "fear", "score": 0.0 },
      { "label": "surprise", "score": 0.0 },
      { "label": "disgust", "score": 0.0 }
    ];
    
    userEmotions.mockResolvedValue(fallbackResponse);

    const res = await request(app)
      .post('/session/endSession')
      .send({
        userId: 'testuser123',
        sessionId: 'session123',
        language: 'en',
        sessionType: 'individual'
      });

    // Session should complete successfully even with fallback emotions
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.emotions).toEqual(fallbackResponse);
    expect(res.body.data.sessionId).toBe('session123');
    
    // Verify userEmotions was called
    expect(userEmotions).toHaveBeenCalledWith(
      JSON.stringify({ text: 'I feel sad today I understand you are feeling sad. Can you tell me more? Yes, I lost my job yesterday' })
    );
  });

  it('should complete session processing when userEmotions returns actual API response', async () => {
    // Mock session data
    const mockChatlog = [
      { role: 'user', content: 'I am very happy today!' },
      { role: 'assistant', content: 'That is wonderful to hear!' }
    ];

    getTexts.mockResolvedValue({ chatlog: mockChatlog });
    
    // Mock userEmotions to return an actual API response
    const apiResponse = [
      { "label": "joy", "score": 0.8 },
      { "label": "neutral", "score": 0.2 },
      { "label": "sadness", "score": 0.0 }
    ];
    
    userEmotions.mockResolvedValue(apiResponse);

    const res = await request(app)
      .post('/session/endSession')
      .send({
        userId: 'testuser123',
        sessionId: 'session123',
        language: 'en',
        sessionType: 'individual'
      });

    // Session should complete successfully with actual emotions
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.emotions).toEqual(apiResponse);
    
    // Verify userEmotions was called
    expect(userEmotions).toHaveBeenCalledWith(
      JSON.stringify({ text: 'I am very happy today! That is wonderful to hear!' })
    );
  });
});
const axios = require('axios');

// Mock all external dependencies before importing
jest.mock('../config/connection', () => ({
  summaryRef: {},
  sessionTextsRef: {}
}));
jest.mock('../utils/errorHandler', () => ({
  handleDatabaseError: jest.fn(),
  handleExternalServiceError: jest.fn()
}));
jest.mock('axios');

const { userEmotions } = require('../controllers/user-controllers');
const mockedAxios = axios;

describe('userEmotions fallback behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console logs during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const expectedDefaultResponse = [
    { "label": "neutral", "score": 1.0 },
    { "label": "sadness", "score": 0.0 },
    { "label": "joy", "score": 0.0 },
    { "label": "anger", "score": 0.0 },
    { "label": "fear", "score": 0.0 },
    { "label": "surprise", "score": 0.0 },
    { "label": "disgust", "score": 0.0 },
    { "label": "disappointment", "score": 0.0 },
    { "label": "grief", "score": 0.0 },
    { "label": "remorse", "score": 0.0 },
    { "label": "annoyance", "score": 0.0 },
    { "label": "disapproval", "score": 0.0 },
    { "label": "caring", "score": 0.0 },
    { "label": "realization", "score": 0.0 },
    { "label": "nervousness", "score": 0.0 },
    { "label": "optimism", "score": 0.0 },
    { "label": "approval", "score": 0.0 },
    { "label": "desire", "score": 0.0 },
    { "label": "love", "score": 0.0 },
    { "label": "admiration", "score": 0.0 },
    { "label": "curiosity", "score": 0.0 },
    { "label": "amusement", "score": 0.0 },
    { "label": "confusion", "score": 0.0 },
    { "label": "excitement", "score": 0.0 },
    { "label": "relief", "score": 0.0 },
    { "label": "gratitude", "score": 0.0 },
    { "label": "embarrassment", "score": 0.0 },
    { "label": "pride", "score": 0.0 }
  ];

  it('should return actual API response when service is available', async () => {
    const mockApiResponse = [
      { "label": "joy", "score": 0.8 },
      { "label": "neutral", "score": 0.2 }
    ];
    
    mockedAxios.post.mockResolvedValue({ data: mockApiResponse });

    const result = await userEmotions(JSON.stringify({ text: "I am happy today" }));

    expect(result).toEqual(mockApiResponse);
    expect(console.log).toHaveBeenCalledWith("Emotion analysis completed successfully");
  });

  it('should return default neutral response on HTTP 500 error', async () => {
    const error = new Error('Internal Server Error');
    error.response = { status: 500 };
    mockedAxios.post.mockRejectedValue(error);

    const result = await userEmotions(JSON.stringify({ text: "test" }));

    expect(result).toEqual(expectedDefaultResponse);
    expect(console.error).toHaveBeenCalledWith(
      'Emotion analysis service failed, using default neutral response:', 
      'Internal Server Error'
    );
  });

  it('should return default neutral response on network timeout', async () => {
    const error = new Error('timeout of 30000ms exceeded');
    error.code = 'ECONNABORTED';
    mockedAxios.post.mockRejectedValue(error);

    const result = await userEmotions(JSON.stringify({ text: "test" }));

    expect(result).toEqual(expectedDefaultResponse);
    expect(console.error).toHaveBeenCalledWith(
      'Emotion analysis service failed, using default neutral response:', 
      'timeout of 30000ms exceeded'
    );
  });

  it('should return default neutral response on network failure', async () => {
    const error = new Error('Network Error');
    error.code = 'ECONNREFUSED';
    mockedAxios.post.mockRejectedValue(error);

    const result = await userEmotions(JSON.stringify({ text: "test" }));

    expect(result).toEqual(expectedDefaultResponse);
    expect(console.error).toHaveBeenCalledWith(
      'Emotion analysis service failed, using default neutral response:', 
      'Network Error'
    );
  });

  it('should return default neutral response on service unavailable', async () => {
    const error = new Error('Service Unavailable');
    error.response = { status: 503 };
    mockedAxios.post.mockRejectedValue(error);

    const result = await userEmotions(JSON.stringify({ text: "test" }));

    expect(result).toEqual(expectedDefaultResponse);
    expect(console.error).toHaveBeenCalledWith(
      'Emotion analysis service failed, using default neutral response:', 
      'Service Unavailable'
    );
  });

  it('should return default response even for missing data parameter to ensure session continues', async () => {
    // The function returns default response for missing data to ensure session processing continues
    const result1 = await userEmotions(null);
    const result2 = await userEmotions(undefined);
    const result3 = await userEmotions('');
    
    expect(result1).toEqual(expectedDefaultResponse);
    expect(result2).toEqual(expectedDefaultResponse);
    expect(result3).toEqual(expectedDefaultResponse);
    
    expect(console.error).toHaveBeenCalledWith(
      'Emotion analysis service failed, using default neutral response:', 
      'Data is required for emotion analysis'
    );
  });

  it('should have neutral as highest score in default response', () => {
    const neutralEmotion = expectedDefaultResponse.find(e => e.label === 'neutral');
    expect(neutralEmotion.score).toBe(1.0);
    
    const otherEmotions = expectedDefaultResponse.filter(e => e.label !== 'neutral');
    otherEmotions.forEach(emotion => {
      expect(emotion.score).toBe(0.0);
    });
  });

  it('should include all required emotion labels in default response', () => {
    const labels = expectedDefaultResponse.map(e => e.label);
    const requiredLabels = [
      'neutral', 'sadness', 'joy', 'anger', 'fear', 'surprise', 'disgust',
      'disappointment', 'grief', 'remorse', 'annoyance', 'disapproval',
      'caring', 'realization', 'nervousness', 'optimism', 'approval',
      'desire', 'love', 'admiration', 'curiosity', 'amusement',
      'confusion', 'excitement', 'relief', 'gratitude', 'embarrassment', 'pride'
    ];
    
    requiredLabels.forEach(label => {
      expect(labels).toContain(label);
    });
  });
});
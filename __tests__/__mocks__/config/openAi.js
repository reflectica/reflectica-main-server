// Mock OpenAI configuration for testing
module.exports = {
  callAI: jest.fn(),
  callOpenAi: jest.fn(),
  createEmbeddings: jest.fn(),
  openai: {
    audio: {
      speech: {
        create: jest.fn()
      }
    }
  }
};
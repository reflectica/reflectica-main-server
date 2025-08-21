// Mock text utilities for testing
module.exports = {
  sentiment: jest.fn(),
  askForShortSummary: jest.fn(),
  askForin5LongSummary: jest.fn(),
  askForin3LongSummary: jest.fn(),
  askForUserProfile: jest.fn(),
  askForDSMScores: jest.fn(),
  askForDSMScoresSpanish: jest.fn(),
  englishToSpanish: jest.fn(),
  diagnostic: jest.fn(),
  systemPromptCBT: jest.fn(),
  systemPromptREBT: jest.fn()
};
// Mock user controllers for testing
module.exports = {
  getAllUserSessions: jest.fn(),
  getSentiment: jest.fn(),
  userEmotions: jest.fn(),
  parseScores: jest.fn(),
  calculateMentalHealthScore: jest.fn(),
  normalizeScores: jest.fn(),
  emailAllUserTranscripts: jest.fn(),
  deleteAllUserSummaries: jest.fn(),
  updateFieldInUserCollection: jest.fn(),
  checkForExistingData: jest.fn()
};
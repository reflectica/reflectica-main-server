// Create a mock Firebase connection for testing
const createMockChain = () => ({
  where: jest.fn(() => createMockChain()),
  orderBy: jest.fn(() => createMockChain()),
  limit: jest.fn(() => createMockChain()),
  get: jest.fn(() => Promise.resolve({
    empty: true,
    forEach: jest.fn()
  }))
});

module.exports = {
  summaryRef: {
    ...createMockChain(),
    add: jest.fn(() => Promise.resolve())
  },
  sessionTextsRef: {
    ...createMockChain(),
    add: jest.fn(() => Promise.resolve()),
    firestore: {
      batch: jest.fn(() => ({
        delete: jest.fn(),
        commit: jest.fn(() => Promise.resolve())
      }))
    }
  },
  db: {
    batch: jest.fn(() => ({
      delete: jest.fn(),
      commit: jest.fn(() => Promise.resolve())
    }))
  }
};
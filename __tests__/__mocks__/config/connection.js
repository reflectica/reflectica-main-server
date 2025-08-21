// Create a mock Firebase connection for testing
const createMockQuery = () => ({
  where: jest.fn(() => createMockQuery()),
  orderBy: jest.fn(() => createMockQuery()),
  limit: jest.fn(() => createMockQuery()),
  get: jest.fn(() => Promise.resolve({
    empty: true,
    forEach: jest.fn()
  }))
});

module.exports = {
  summaryRef: {
    ...createMockQuery(),
    add: jest.fn(() => Promise.resolve())
  },
  sessionTextsRef: {
    ...createMockQuery(),
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
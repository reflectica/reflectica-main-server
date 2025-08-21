// Create a mock Firebase connection for testing
module.exports = {
  summaryRef: {
    where: jest.fn(() => ({
      get: jest.fn(() => Promise.resolve({
        empty: true,
        forEach: jest.fn()
      }))
    })),
    add: jest.fn(() => Promise.resolve())
  },
  sessionTextsRef: {
    where: jest.fn(() => ({
      where: jest.fn(() => ({
        orderBy: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({
            empty: true,
            forEach: jest.fn()
          }))
        })),
        get: jest.fn(() => Promise.resolve({
          empty: true,
          forEach: jest.fn()
        }))
      }))
    })),
    add: jest.fn(() => Promise.resolve())
  }
};
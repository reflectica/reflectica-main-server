require('dotenv').config({ path: '.env.test' });

// Mock console.error to reduce noise in tests
global.console = {
  ...console,
  error: jest.fn(),
  log: jest.fn()
};
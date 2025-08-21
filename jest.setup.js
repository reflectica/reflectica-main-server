require('dotenv').config({ path: '.env.test' });

// Mock Firebase admin to avoid connection issues in tests
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn()
  },
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      where: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({ empty: true })),
        orderBy: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({ empty: true }))
        }))
      })),
      add: jest.fn(() => Promise.resolve()),
      doc: jest.fn(() => ({
        update: jest.fn(() => Promise.resolve())
      }))
    }))
  }))
}));

// Mock Pinecone to avoid connection issues in tests
jest.mock('@pinecone-database/pinecone', () => ({
  Pinecone: jest.fn().mockImplementation(() => ({
    index: jest.fn(() => ({
      upsert: jest.fn(() => Promise.resolve()),
      query: jest.fn(() => Promise.resolve({ matches: [] }))
    }))
  }))
}));
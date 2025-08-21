// Mock environment variables for testing
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_PRIVATE_KEY_ID = 'test-key-id';
process.env.FIREBASE_PRIVATE_KEY = 'test-private-key';
process.env.FIREBASE_CLIENT_EMAIL = 'test@example.com';
process.env.FIREBASE_CLIENT_ID = 'test-client-id';
process.env.FIREBASE_AUTH_URI = 'https://accounts.google.com/o/oauth2/auth';
process.env.FIREBASE_TOKEN_URI = 'https://oauth2.googleapis.com/token';
process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL = 'https://www.googleapis.com/oauth2/v1/certs';
process.env.FIREBASE_CLIENT_X509_CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/test%40example.com';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.GMAIL_PASS_KEY = 'test-gmail-key';
process.env.PINECONE_API_KEY = 'test-pinecone-key';
process.env.PINECONE_ENVIRONMENT = 'test-environment';

// Mock Firebase Admin SDK
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(() => ({}))
  },
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      where: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({
          empty: true,
          forEach: jest.fn()
        })),
        orderBy: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({
            empty: true,
            forEach: jest.fn()
          }))
        }))
      }))
    }))
  })),
  auth: jest.fn()
}));
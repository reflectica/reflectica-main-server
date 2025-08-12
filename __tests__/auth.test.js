const request = require('supertest');
const express = require('express');
const { authenticateUser } = require('../middleware/auth');

// Mock Firebase admin before importing middleware
jest.mock('../config/connection', () => ({
  admin: {
    auth: () => ({
      verifyIdToken: jest.fn()
    })
  }
}));

const { admin } = require('../config/connection');

const app = express();
app.use(express.json());

// Test route that uses authentication
app.post('/test', authenticateUser, (req, res) => {
  res.json({ message: 'success', user: req.user });
});

describe('Authentication Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should deny access without authorization header', async () => {
    const res = await request(app)
      .post('/test')
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing or invalid authorization header');
  });

  it('should deny access with invalid authorization header format', async () => {
    const res = await request(app)
      .post('/test')
      .set('Authorization', 'InvalidFormat')
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing or invalid authorization header');
  });

  it('should deny access with missing token', async () => {
    const res = await request(app)
      .post('/test')
      .set('Authorization', 'Bearer    ')  // Spaces after Bearer but no actual token
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Missing Firebase ID token');
  });

  it('should deny access with invalid token', async () => {
    const mockVerifyIdToken = admin.auth().verifyIdToken;
    mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

    const res = await request(app)
      .post('/test')
      .set('Authorization', 'Bearer invalid-token')
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  it('should allow access with valid token', async () => {
    const mockDecodedToken = {
      uid: 'user123',
      email: 'test@example.com',
      roles: ['user']
    };

    const mockVerifyIdToken = admin.auth().verifyIdToken;
    mockVerifyIdToken.mockResolvedValue(mockDecodedToken);

    const res = await request(app)
      .post('/test')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('success');
    expect(res.body.user.uid).toBe('user123');
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user.roles).toEqual(['user']);
  });

  it('should set default role for users without roles', async () => {
    const mockDecodedToken = {
      uid: 'user123',
      email: 'test@example.com'
      // No roles property
    };

    const mockVerifyIdToken = admin.auth().verifyIdToken;
    mockVerifyIdToken.mockResolvedValue(mockDecodedToken);

    const res = await request(app)
      .post('/test')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.user.roles).toEqual(['user']);
  });
});
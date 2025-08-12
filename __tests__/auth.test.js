const request = require('supertest');
const express = require('express');

// Mock Firebase admin BEFORE importing the middleware
const mockVerifyIdToken = jest.fn();
jest.mock('../config/connection', () => ({
  admin: {
    auth: () => ({
      verifyIdToken: mockVerifyIdToken
    })
  }
}));

const { authenticateToken, authorizeUser } = require('../middleware/auth');

describe('Authentication Middleware', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Test route that requires authentication
    app.post('/protected', authenticateToken, (req, res) => {
      res.json({ message: 'success', user: req.user });
    });
    
    // Test route that requires authentication and authorization
    app.post('/user-data', authenticateToken, authorizeUser, (req, res) => {
      res.json({ message: 'user data accessed' });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticateToken middleware', () => {
    it('should return 401 if no authorization header', async () => {
      const res = await request(app)
        .post('/protected')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authorization header with Bearer token required');
    });

    it('should return 401 if authorization header does not start with Bearer', async () => {
      const res = await request(app)
        .post('/protected')
        .set('Authorization', 'Invalid token')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authorization header with Bearer token required');
    });

    it('should return 401 if token is empty', async () => {
      const res = await request(app)
        .post('/protected')
        .set('Authorization', 'Bearer   ') // Empty token with spaces
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Valid token required');
    });

    it('should return 401 if token verification fails', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

      const res = await request(app)
        .post('/protected')
        .set('Authorization', 'Bearer invalid-token')
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or expired token');
    });

    it('should proceed if token is valid', async () => {
      const mockUser = {
        uid: 'user123',
        email: 'test@example.com',
        email_verified: true
      };

      mockVerifyIdToken.mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/protected')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('success');
      expect(res.body.user.uid).toBe('user123');
      expect(res.body.user.email).toBe('test@example.com');
    });
  });

  describe('authorizeUser middleware', () => {
    beforeEach(() => {
      const mockUser = {
        uid: 'user123',
        email: 'test@example.com',
        email_verified: true
      };
      mockVerifyIdToken.mockResolvedValue(mockUser);
    });

    it('should return 400 if userId is missing', async () => {
      const res = await request(app)
        .post('/user-data')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('userId is required');
    });

    it('should return 403 if user tries to access another users data', async () => {
      const res = await request(app)
        .post('/user-data')
        .set('Authorization', 'Bearer valid-token')
        .send({ userId: 'different-user' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Access denied: insufficient permissions');
    });

    it('should proceed if user accesses their own data', async () => {
      const res = await request(app)
        .post('/user-data')
        .set('Authorization', 'Bearer valid-token')
        .send({ userId: 'user123' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('user data accessed');
    });
  });
});
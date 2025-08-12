const request = require('supertest');
const express = require('express');
const { 
  requirePermission, 
  requirePHIRead, 
  requirePHIWrite,
  PERMISSIONS,
  hasPermission,
  canAccessResource
} = require('../middleware/rbac');
const { db } = require('../config/connection');

// Mock Firebase connection
jest.mock('../config/connection', () => ({
  db: {
    collection: jest.fn(() => ({
      add: jest.fn()
    }))
  }
}));

const app = express();
app.use(express.json());

// Mock user middleware that sets req.user
const mockUser = (user) => (req, res, next) => {
  req.user = user;
  next();
};

// Test routes
app.post('/test-phi-read', mockUser({ uid: 'user123', roles: ['user'] }), requirePHIRead(), (req, res) => {
  res.json({ message: 'success' });
});

app.post('/test-phi-write', mockUser({ uid: 'user123', roles: ['user'] }), requirePHIWrite(), (req, res) => {
  res.json({ message: 'success' });
});

app.post('/test-admin-only', mockUser({ uid: 'admin123', roles: ['admin'] }), requirePermission(PERMISSIONS.PHI_READ_ALL), (req, res) => {
  res.json({ message: 'success' });
});

describe('RBAC Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console.log to suppress audit logs during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
  });

  describe('Permission checking utilities', () => {
    it('should correctly identify user permissions', () => {
      expect(hasPermission(['user'], PERMISSIONS.PHI_READ_OWN)).toBe(true);
      expect(hasPermission(['user'], PERMISSIONS.PHI_READ_ALL)).toBe(false);
      expect(hasPermission(['admin'], PERMISSIONS.PHI_READ_ALL)).toBe(true);
      expect(hasPermission(['auditor'], PERMISSIONS.PHI_READ_ALL)).toBe(true);
      expect(hasPermission(['auditor'], PERMISSIONS.PHI_WRITE_ALL)).toBe(false);
    });

    it('should handle resource access correctly', () => {
      const userReq = {
        user: { uid: 'user123', roles: ['user'] }
      };
      const adminReq = {
        user: { uid: 'admin123', roles: ['admin'] }
      };

      // User can access own resources
      expect(canAccessResource(userReq, 'user123', PERMISSIONS.PHI_READ_OWN)).toBe(true);
      // User cannot access other users' resources
      expect(canAccessResource(userReq, 'other456', PERMISSIONS.PHI_READ_OWN)).toBe(false);
      // Admin can access all resources
      expect(canAccessResource(adminReq, 'user123', PERMISSIONS.PHI_READ_ALL)).toBe(true);
      expect(canAccessResource(adminReq, 'other456', PERMISSIONS.PHI_READ_ALL)).toBe(true);
    });
  });

  describe('PHI Read Access', () => {
    it('should allow user to read own PHI data', async () => {
      const res = await request(app)
        .post('/test-phi-read')
        .send({ userId: 'user123' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('success');
    });

    it('should deny user access to other users PHI data', async () => {
      const res = await request(app)
        .post('/test-phi-read')
        .send({ userId: 'other456' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Insufficient permissions');
    });

    it('should deny access without authentication', async () => {
      const app2 = express();
      app2.use(express.json());
      app2.post('/test-no-auth', requirePHIRead(), (req, res) => {
        res.json({ message: 'success' });
      });

      const res = await request(app2)
        .post('/test-no-auth')
        .send({ userId: 'user123' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Authentication required');
    });
  });

  describe('PHI Write Access', () => {
    it('should allow user to write own PHI data', async () => {
      const res = await request(app)
        .post('/test-phi-write')
        .send({ userId: 'user123' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('success');
    });

    it('should deny user writing to other users PHI data', async () => {
      const res = await request(app)
        .post('/test-phi-write')
        .send({ userId: 'other456' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Insufficient permissions');
    });
  });

  describe('Admin Access', () => {
    it('should allow admin to access all PHI data', async () => {
      const res = await request(app)
        .post('/test-admin-only')
        .send({ userId: 'any-user' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('success');
    });

    it('should deny regular user admin-level access', async () => {
      const app3 = express();
      app3.use(express.json());
      app3.post('/test-user-admin', mockUser({ uid: 'user123', roles: ['user'] }), requirePermission(PERMISSIONS.PHI_READ_ALL), (req, res) => {
        res.json({ message: 'success' });
      });

      const res = await request(app3)
        .post('/test-user-admin')
        .send({ userId: 'any-user' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Insufficient permissions');
    });
  });

  describe('Auditing', () => {
    it('should log access attempts to database', async () => {
      const mockAdd = db.collection().add;
      mockAdd.mockResolvedValue({});

      await request(app)
        .post('/test-phi-read')
        .send({ userId: 'user123' });

      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          resource: expect.any(String),
          action: 'access',
          result: 'allowed'
        })
      );
    });
  });
});
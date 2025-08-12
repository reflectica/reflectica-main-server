// Mock Firestore before requiring the audit logger
const mockAdd = jest.fn();
jest.mock('../config/connection', () => ({
  db: {
    collection: jest.fn(() => ({
      add: mockAdd
    }))
  }
}));

const auditLogger = require('../utils/auditLogger');

describe('AuditLogger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logEvent', () => {
    it('should create audit entry with all required fields', async () => {
      const event = {
        userId: 'user123',
        action: 'READ',
        resource: '/test/route',
        result: 'SUCCESS',
        requestId: 'req123',
        ipAddress: '127.0.0.1',
        userAgent: 'Test-Agent',
        metadata: { test: 'data' }
      };

      mockAdd.mockResolvedValue({});

      await auditLogger.logEvent(event);

      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          action: 'READ',
          resource: '/test/route',
          result: 'SUCCESS',
          requestId: 'req123',
          ipAddress: '127.0.0.1',
          userAgent: 'Test-Agent',
          metadata: { test: 'data' },
          id: expect.any(String),
          timestamp: expect.any(String),
          created_at: expect.any(Date)
        })
      );
    });

    it('should handle missing optional fields', async () => {
      const event = {
        action: 'READ',
        resource: '/test',
        result: 'SUCCESS',
        requestId: 'req123',
        ipAddress: '127.0.0.1',
        userAgent: 'Test-Agent'
      };

      mockAdd.mockResolvedValue({});

      await auditLogger.logEvent(event);

      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: null,
          metadata: {}
        })
      );
    });

    it('should not throw error when Firestore fails', async () => {
      const event = {
        action: 'READ',
        resource: '/test',
        result: 'SUCCESS',
        requestId: 'req123',
        ipAddress: '127.0.0.1',
        userAgent: 'Test-Agent'
      };

      mockAdd.mockRejectedValue(new Error('Firestore error'));

      const result = await auditLogger.logEvent(event);

      expect(result).toBeNull();
      expect(mockAdd).toHaveBeenCalled();
    });
  });

  describe('logSuccess', () => {
    it('should log successful event with correct result', async () => {
      mockAdd.mockResolvedValue({});

      await auditLogger.logSuccess(
        'user123',
        'READ',
        '/test',
        'req123',
        '127.0.0.1',
        'Test-Agent',
        { extra: 'data' }
      );

      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'SUCCESS',
          metadata: { extra: 'data' }
        })
      );
    });
  });

  describe('logFailure', () => {
    it('should log failure event with error details', async () => {
      mockAdd.mockResolvedValue({});
      const error = new Error('Test error');

      await auditLogger.logFailure(
        'user123',
        'READ',
        '/test',
        'req123',
        '127.0.0.1',
        'Test-Agent',
        error,
        { extra: 'data' }
      );

      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'FAILURE',
          metadata: {
            extra: 'data',
            error: 'Test error'
          }
        })
      );
    });
  });
});
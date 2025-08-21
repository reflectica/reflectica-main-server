const { 
  generateSessionId, 
  isValidSessionId, 
  validateSessionAccess, 
  getSessionStats 
} = require('../utils/sessionUtils');

describe('Session Utils Tests', () => {
  describe('generateSessionId', () => {
    it('should generate a valid session ID', () => {
      const sessionId = generateSessionId();
      expect(sessionId).toMatch(/^session_\d+_[a-f0-9]{16}$/);
    });

    it('should generate unique session IDs', () => {
      const sessionId1 = generateSessionId();
      const sessionId2 = generateSessionId();
      expect(sessionId1).not.toBe(sessionId2);
    });
  });

  describe('isValidSessionId', () => {
    it('should validate generated session IDs', () => {
      const sessionId = generateSessionId();
      expect(isValidSessionId(sessionId)).toBe(true);
    });

    it('should validate legacy session ID formats', () => {
      expect(isValidSessionId('session1')).toBe(true);
      expect(isValidSessionId('test_session_123')).toBe(true);
      expect(isValidSessionId('session-abc-def')).toBe(true);
    });

    it('should reject invalid session IDs', () => {
      expect(isValidSessionId('')).toBe(false);
      expect(isValidSessionId(null)).toBe(false);
      expect(isValidSessionId(undefined)).toBe(false);
      expect(isValidSessionId('invalid session!')).toBe(false);
      expect(isValidSessionId('session with spaces')).toBe(false);
    });
  });

  describe('validateSessionAccess', () => {
    const mockSessionTextsRef = {
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn()
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return true for valid session access', async () => {
      const mockQuerySnapshot = {
        empty: false
      };
      mockSessionTextsRef.get.mockResolvedValue(mockQuerySnapshot);

      const result = await validateSessionAccess('user1', 'session1', mockSessionTextsRef);
      expect(result).toBe(true);
      expect(mockSessionTextsRef.where).toHaveBeenCalledWith("uid", "==", 'user1');
      expect(mockSessionTextsRef.where).toHaveBeenCalledWith("sessionId", "==", 'session1');
    });

    it('should return false for invalid session access', async () => {
      const mockQuerySnapshot = {
        empty: true
      };
      mockSessionTextsRef.get.mockResolvedValue(mockQuerySnapshot);

      const result = await validateSessionAccess('user1', 'session1', mockSessionTextsRef);
      expect(result).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      mockSessionTextsRef.get.mockRejectedValue(new Error('Database error'));

      const result = await validateSessionAccess('user1', 'session1', mockSessionTextsRef);
      expect(result).toBe(false);
    });
  });

  describe('getSessionStats', () => {
    const mockSessionTextsRef = {
      where: jest.fn().mockReturnThis(),
      get: jest.fn()
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return stats for existing session', async () => {
      const mockQuerySnapshot = {
        empty: false,
        forEach: jest.fn(callback => {
          callback({
            data: () => ({
              chatlog: [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi' }
              ],
              time: '2024-01-15T10:00:00Z'
            })
          });
        })
      };
      mockSessionTextsRef.get.mockResolvedValue(mockQuerySnapshot);

      const result = await getSessionStats('session1', mockSessionTextsRef);
      expect(result.exists).toBe(true);
      expect(result.messageCount).toBe(2);
      expect(result.lastActivity).toBe('2024-01-15T10:00:00Z');
    });

    it('should return non-existent stats for missing session', async () => {
      const mockQuerySnapshot = {
        empty: true
      };
      mockSessionTextsRef.get.mockResolvedValue(mockQuerySnapshot);

      const result = await getSessionStats('session1', mockSessionTextsRef);
      expect(result.exists).toBe(false);
      expect(result.messageCount).toBe(0);
      expect(result.lastActivity).toBe(null);
    });

    it('should handle database errors gracefully', async () => {
      mockSessionTextsRef.get.mockRejectedValue(new Error('Database error'));

      const result = await getSessionStats('session1', mockSessionTextsRef);
      expect(result.exists).toBe(false);
      expect(result.messageCount).toBe(0);
      expect(result.lastActivity).toBe(null);
    });
  });
});
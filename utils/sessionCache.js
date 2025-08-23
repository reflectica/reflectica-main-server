// utils/sessionCache.js

const logger = require('./logger');

/**
 * In-memory cache for session draft states
 * This provides resilience during network interruptions
 */
class SessionCache {
  constructor() {
    this.cache = new Map();
    this.ttl = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    // Cleanup expired entries every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000);
  }

  /**
   * Generate cache key from userId and sessionId
   */
  _getCacheKey(userId, sessionId) {
    return `${userId}:${sessionId}`;
  }

  /**
   * Save draft session state
   */
  saveDraft(userId, sessionId, data) {
    const key = this._getCacheKey(userId, sessionId);
    const entry = {
      data,
      timestamp: Date.now(),
      userId,
      sessionId
    };

    this.cache.set(key, entry);
    
    logger.debug('Session draft saved to cache', {
      userId,
      sessionId,
      dataKeys: Object.keys(data),
      cacheSize: this.cache.size
    });

    return entry;
  }

  /**
   * Retrieve draft session state
   */
  getDraft(userId, sessionId) {
    const key = this._getCacheKey(userId, sessionId);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry is expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      logger.debug('Expired session draft removed', { userId, sessionId });
      return null;
    }

    logger.debug('Session draft retrieved from cache', {
      userId,
      sessionId,
      age: Date.now() - entry.timestamp
    });

    return entry.data;
  }

  /**
   * Update existing draft with new data
   */
  updateDraft(userId, sessionId, updates) {
    const existing = this.getDraft(userId, sessionId);
    const mergedData = existing ? { ...existing, ...updates } : updates;
    
    return this.saveDraft(userId, sessionId, mergedData);
  }

  /**
   * Remove draft from cache
   */
  removeDraft(userId, sessionId) {
    const key = this._getCacheKey(userId, sessionId);
    const existed = this.cache.has(key);
    
    this.cache.delete(key);
    
    if (existed) {
      logger.debug('Session draft removed from cache', { userId, sessionId });
    }
    
    return existed;
  }

  /**
   * Check if draft exists
   */
  hasDraft(userId, sessionId) {
    const draft = this.getDraft(userId, sessionId);
    return draft !== null;
  }

  /**
   * Get all drafts for a user
   */
  getUserDrafts(userId) {
    const userDrafts = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.userId === userId) {
        // Check if expired
        if (Date.now() - entry.timestamp <= this.ttl) {
          userDrafts.push({
            sessionId: entry.sessionId,
            data: entry.data,
            timestamp: entry.timestamp
          });
        } else {
          // Remove expired entry
          this.cache.delete(key);
        }
      }
    }

    return userDrafts;
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.info('Session cache cleanup completed', {
        removedCount,
        remainingCount: this.cache.size
      });
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    const stats = {
      totalEntries: this.cache.size,
      activeEntries: 0,
      expiredEntries: 0,
      oldestEntry: null,
      newestEntry: null
    };

    let oldestTime = Infinity;
    let newestTime = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp <= this.ttl) {
        stats.activeEntries++;
      } else {
        stats.expiredEntries++;
      }

      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        stats.oldestEntry = entry.timestamp;
      }

      if (entry.timestamp > newestTime) {
        newestTime = entry.timestamp;
        stats.newestEntry = entry.timestamp;
      }
    }

    return stats;
  }

  /**
   * Clear all cache entries (for testing or emergency cleanup)
   */
  clear() {
    const count = this.cache.size;
    this.cache.clear();
    
    logger.info('Session cache cleared', { removedCount: count });
    return count;
  }

  /**
   * Shutdown cleanup interval
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Global session cache instance
const sessionCache = new SessionCache();

/**
 * Convenience functions for common draft operations
 */
const draftOperations = {
  /**
   * Save chat message draft
   */
  saveChatDraft: (userId, sessionId, chatlog, aiResponse = null) => {
    const data = {
      type: 'chat',
      chatlog,
      aiResponse,
      timestamp: new Date().toISOString()
    };
    return sessionCache.saveDraft(userId, sessionId, data);
  },

  /**
   * Save session end draft with partial processing
   */
  saveSessionEndDraft: (userId, sessionId, processedData) => {
    const data = {
      type: 'session_end',
      ...processedData,
      timestamp: new Date().toISOString()
    };
    return sessionCache.updateDraft(userId, sessionId, data);
  },

  /**
   * Get chat draft
   */
  getChatDraft: (userId, sessionId) => {
    const draft = sessionCache.getDraft(userId, sessionId);
    return draft && draft.type === 'chat' ? draft : null;
  },

  /**
   * Get session end draft
   */
  getSessionEndDraft: (userId, sessionId) => {
    const draft = sessionCache.getDraft(userId, sessionId);
    return draft && draft.type === 'session_end' ? draft : null;
  }
};

// Graceful shutdown handler
process.on('SIGTERM', () => {
  sessionCache.shutdown();
});

process.on('SIGINT', () => {
  sessionCache.shutdown();
});

module.exports = {
  sessionCache,
  draftOperations
};
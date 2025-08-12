const { db } = require('../config/connection');
const { v4: uuidv4 } = require('uuid');

/**
 * Audit Logger for PHI access events
 * Writes to an append-only Firestore collection
 */
class AuditLogger {
  constructor() {
    this.auditRef = db.collection('audit_logs');
  }

  /**
   * Log an audit event
   * @param {Object} event - The audit event data
   * @param {string} event.userId - User ID accessing the resource
   * @param {string} event.action - Action performed (CREATE, READ, UPDATE, DELETE)
   * @param {string} event.resource - Resource path/endpoint accessed
   * @param {string} event.result - Result of the action (SUCCESS, FAILURE)
   * @param {string} event.requestId - Unique request identifier
   * @param {string} event.ipAddress - Client IP address
   * @param {string} event.userAgent - Client user agent
   * @param {Object} event.metadata - Additional metadata (no PHI payloads)
   */
  async logEvent(event) {
    try {
      const auditEntry = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        userId: event.userId || null,
        action: event.action,
        resource: event.resource,
        result: event.result,
        requestId: event.requestId,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        metadata: event.metadata || {},
        // Immutable - once written, cannot be modified
        created_at: new Date()
      };

      await this.auditRef.add(auditEntry);
      console.log(`Audit log created: ${auditEntry.id}`);
      
      return auditEntry.id;
    } catch (error) {
      console.error('Failed to create audit log:', error);
      // Don't throw error to avoid breaking the main request
      return null;
    }
  }

  /**
   * Log successful PHI access
   */
  async logSuccess(userId, action, resource, requestId, ipAddress, userAgent, metadata = {}) {
    return await this.logEvent({
      userId,
      action,
      resource,
      result: 'SUCCESS',
      requestId,
      ipAddress,
      userAgent,
      metadata
    });
  }

  /**
   * Log failed PHI access attempt
   */
  async logFailure(userId, action, resource, requestId, ipAddress, userAgent, error, metadata = {}) {
    return await this.logEvent({
      userId,
      action,
      resource,
      result: 'FAILURE',
      requestId,
      ipAddress,
      userAgent,
      metadata: {
        ...metadata,
        error: error.message || error.toString()
      }
    });
  }
}

module.exports = new AuditLogger();
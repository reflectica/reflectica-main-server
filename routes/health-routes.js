const route = require('express').Router();
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const { db } = require('../config/connection');

route.get('/', async (req, res) => {
  try {
    const healthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development'
    };

    logger.debug('Health check requested', { ip: req.ip });
    res.status(200).json(healthCheck);
  } catch (error) {
    logger.error('Health check failed', { error: error.message, stack: error.stack });
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

route.get('/detailed', async (req, res) => {
  try {
    const detailedHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version
      },
      environment: process.env.NODE_ENV || 'development'
    };

    logger.info('Detailed health check requested', { ip: req.ip });
    res.status(200).json(detailedHealth);
  } catch (error) {
    logger.error('Detailed health check failed', { error: error.message, stack: error.stack });
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

route.get('/errors', async (req, res) => {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Query recent errors from Firestore (no orderBy to avoid index requirement)
    const recentErrorsQuery = await db.collection('logs')
      .where('level', '==', 'error')
      .limit(50)
      .get();

    const errors = [];
    recentErrorsQuery.forEach(doc => {
      errors.push(doc.data());
    });

    // Sort errors by timestamp (newest first) and filter by time ranges
    const sortedErrors = errors.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const dayFilteredErrors = sortedErrors.filter(e => {
      const errorTime = new Date(e.timestamp);
      return errorTime >= oneDayAgo;
    });

    const lastHourErrors = dayFilteredErrors.filter(e => {
      const errorTime = new Date(e.timestamp);
      return errorTime >= oneHourAgo;
    }).length;

    const errorSummary = {
      totalErrors: dayFilteredErrors.length,
      lastHour: lastHourErrors,
      recentErrors: dayFilteredErrors.slice(0, 10).map(error => ({
        timestamp: error.timestamp,
        message: error.message,
        userId: error.userId,
        sessionId: error.sessionId,
        url: error.url,
        method: error.method
      })),
      timestamp: now.toISOString()
    };

    logger.debug('Error monitoring dashboard accessed', { ip: req.ip });
    res.status(200).json(errorSummary);
  } catch (error) {
    logger.error('Error dashboard failed', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: 'Failed to retrieve error information',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = route;
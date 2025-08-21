const route = require('express').Router();
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

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
    const logsDir = path.join(__dirname, '../logs');
    const today = new Date().toISOString().split('T')[0];
    const errorLogPath = path.join(logsDir, `error-${today}.log`);
    
    let errors = [];
    if (fs.existsSync(errorLogPath)) {
      const errorLogContent = fs.readFileSync(errorLogPath, 'utf8');
      errors = errorLogContent
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return { message: line, timestamp: new Date().toISOString() };
          }
        })
        .slice(-50); // Last 50 errors
    }

    const errorSummary = {
      totalErrors: errors.length,
      lastHour: errors.filter(e => {
        const errorTime = new Date(e.timestamp);
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        return errorTime > oneHourAgo;
      }).length,
      recentErrors: errors.slice(-10),
      timestamp: new Date().toISOString()
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
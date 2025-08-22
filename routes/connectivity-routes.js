// routes/connectivity-routes.js

const route = require('express').Router();
const { getConnectivityStatus, healthCheck, circuitBreakers } = require('../utils/networkReliability');
const { sessionCache } = require('../utils/sessionCache');
const { 
  asyncHandler, 
  createErrorResponse 
} = require('../utils/errorHandler');
const logger = require('../utils/logger');

/**
 * GET /connectivity/status - Get overall connectivity and service status
 */
route.get("/status", asyncHandler(async (req, res) => {
  try {
    const status = await getConnectivityStatus();
    
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    logger.error('Failed to get connectivity status', { error: error.message });
    res.status(500).json(createErrorResponse({
      message: 'Unable to determine connectivity status',
      code: 'CONNECTIVITY_CHECK_FAILED'
    }));
  }
}));

/**
 * GET /connectivity/health - Detailed health check for all services
 */
route.get("/health", asyncHandler(async (req, res) => {
  const services = ['database', 'openai'];
  const results = {};
  
  // Run health checks in parallel
  const healthPromises = services.map(async (service) => {
    try {
      const result = await healthCheck[service]();
      results[service] = {
        ...result,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      results[service] = {
        status: 'error',
        error: error.message,
        lastChecked: new Date().toISOString()
      };
    }
  });

  await Promise.all(healthPromises);

  // Add circuit breaker states
  const circuitBreakerStates = Object.keys(circuitBreakers).reduce((acc, key) => {
    acc[key] = circuitBreakers[key].getState();
    return acc;
  }, {});

  // Add cache statistics
  const cacheStats = sessionCache.getStats();

  const overallHealthy = Object.values(results).every(r => r.status === 'healthy');

  res.json({
    success: true,
    overall: overallHealthy ? 'healthy' : 'degraded',
    services: results,
    circuitBreakers: circuitBreakerStates,
    cache: cacheStats,
    timestamp: new Date().toISOString()
  });
}));

/**
 * GET /connectivity/circuit-breakers - Get circuit breaker status
 */
route.get("/circuit-breakers", asyncHandler(async (req, res) => {
  const states = Object.keys(circuitBreakers).reduce((acc, key) => {
    acc[key] = circuitBreakers[key].getState();
    return acc;
  }, {});

  res.json({
    success: true,
    circuitBreakers: states,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /connectivity/circuit-breakers/:service/reset - Reset circuit breaker for a service
 */
route.post("/circuit-breakers/:service/reset", asyncHandler(async (req, res) => {
  const { service } = req.params;
  
  if (!circuitBreakers[service]) {
    return res.status(404).json(createErrorResponse({
      message: `Circuit breaker for service '${service}' not found`,
      code: 'CIRCUIT_BREAKER_NOT_FOUND'
    }));
  }

  // Reset circuit breaker
  circuitBreakers[service].state = 'CLOSED';
  circuitBreakers[service].failureCount = 0;
  circuitBreakers[service].lastFailureTime = null;

  logger.info('Circuit breaker manually reset', { service });

  res.json({
    success: true,
    message: `Circuit breaker for ${service} has been reset`,
    state: circuitBreakers[service].getState()
  });
}));

/**
 * GET /connectivity/cache - Get session cache statistics
 */
route.get("/cache", asyncHandler(async (req, res) => {
  const stats = sessionCache.getStats();
  
  res.json({
    success: true,
    cache: stats,
    timestamp: new Date().toISOString()
  });
}));

/**
 * POST /connectivity/cache/cleanup - Manually trigger cache cleanup
 */
route.post("/cache/cleanup", asyncHandler(async (req, res) => {
  const initialSize = sessionCache.cache.size;
  sessionCache.cleanup();
  const finalSize = sessionCache.cache.size;
  const removedCount = initialSize - finalSize;

  logger.info('Manual cache cleanup triggered', { 
    initialSize, 
    finalSize, 
    removedCount 
  });

  res.json({
    success: true,
    message: 'Cache cleanup completed',
    initialSize,
    finalSize,
    removedCount
  });
}));

/**
 * GET /connectivity/ping - Simple ping endpoint for basic connectivity test
 */
route.get("/ping", asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'pong',
    timestamp: new Date().toISOString(),
    server: 'reflectica-main-server'
  });
}));

module.exports = route;
// utils/networkReliability.js

const logger = require('./logger');

/**
 * Retry configuration for different operation types
 */
const RETRY_CONFIGS = {
  database: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 2,
    retryableErrors: ['UNAVAILABLE', 'DEADLINE_EXCEEDED', 'INTERNAL', 'RESOURCE_EXHAUSTED']
  },
  externalAPI: {
    maxAttempts: 3,
    baseDelay: 1500,
    maxDelay: 8000,
    backoffMultiplier: 2,
    retryableErrors: ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN']
  },
  openai: {
    maxAttempts: 2,
    baseDelay: 2000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    retryableErrors: ['RATE_LIMIT_EXCEEDED', 'TIMEOUT', 'NETWORK_ERROR', 'INTERNAL_SERVER_ERROR']
  }
};

/**
 * Determines if an error is retryable based on the operation type
 */
const isRetryableError = (error, operationType = 'database') => {
  const config = RETRY_CONFIGS[operationType];
  if (!config) return false;

  // Check error code
  if (error.code && config.retryableErrors.includes(error.code)) {
    return true;
  }

  // Check error message for common patterns
  const errorMessage = error.message ? error.message.toLowerCase() : '';
  const retryablePatterns = [
    'network',
    'timeout',
    'connection',
    'unavailable',
    'rate limit',
    'too many requests',
    'temporary',
    'retry'
  ];

  return retryablePatterns.some(pattern => errorMessage.includes(pattern));
};

/**
 * Calculate delay for exponential backoff with jitter
 */
const calculateDelay = (attempt, config) => {
  const exponentialDelay = Math.min(
    config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
    config.maxDelay
  );
  
  // Add jitter (±25% randomization)
  const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5) * 2;
  return Math.max(100, exponentialDelay + jitter);
};

/**
 * Generic retry wrapper with exponential backoff
 */
const withRetry = async (operation, operationType = 'database', context = {}) => {
  const config = RETRY_CONFIGS[operationType];
  let lastError = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      logger.debug('Attempting operation', { 
        operationType, 
        attempt, 
        maxAttempts: config.maxAttempts,
        ...context 
      });
      
      const result = await operation();
      
      if (attempt > 1) {
        logger.info('Operation succeeded after retry', { 
          operationType, 
          attempt, 
          ...context 
        });
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      const isRetryable = isRetryableError(error, operationType);
      const isLastAttempt = attempt === config.maxAttempts;
      
      logger.warn('Operation failed', {
        operationType,
        attempt,
        maxAttempts: config.maxAttempts,
        error: error.message,
        isRetryable,
        isLastAttempt,
        ...context
      });

      if (!isRetryable || isLastAttempt) {
        logger.error('Operation failed permanently', {
          operationType,
          totalAttempts: attempt,
          finalError: error.message,
          ...context
        });
        throw error;
      }

      // Wait before retry
      const delay = calculateDelay(attempt, config);
      logger.debug('Waiting before retry', { operationType, attempt, delay, ...context });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
};

/**
 * Database operation wrapper with retry logic
 */
const withDatabaseRetry = (operation, context = {}) => {
  return withRetry(operation, 'database', context);
};

/**
 * External API operation wrapper with retry logic
 */
const withExternalAPIRetry = (operation, context = {}) => {
  return withRetry(operation, 'externalAPI', context);
};

/**
 * OpenAI operation wrapper with retry logic
 */
const withOpenAIRetry = (operation, context = {}) => {
  return withRetry(operation, 'openai', context);
};

/**
 * Circuit breaker pattern for external services
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
  }

  async call(operation, context = {}) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        logger.info('Circuit breaker transitioning to HALF_OPEN', context);
      } else {
        const error = new Error('Circuit breaker is OPEN');
        error.code = 'CIRCUIT_BREAKER_OPEN';
        throw error;
      }
    }

    try {
      const result = await operation();
      this.onSuccess(context);
      return result;
    } catch (error) {
      this.onFailure(context);
      throw error;
    }
  }

  onSuccess(context = {}) {
    this.failureCount = 0;
    this.lastSuccessTime = Date.now();
    
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      logger.info('Circuit breaker CLOSED after successful operation', context);
    }
  }

  onFailure(context = {}) {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn('Circuit breaker OPENED due to failures', { 
        failureCount: this.failureCount,
        threshold: this.failureThreshold,
        ...context 
      });
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime
    };
  }
}

/**
 * Global circuit breakers for different services
 */
const circuitBreakers = {
  openai: new CircuitBreaker({ failureThreshold: 3, resetTimeout: 30000 }),
  pinecone: new CircuitBreaker({ failureThreshold: 5, resetTimeout: 60000 }),
  emotions: new CircuitBreaker({ failureThreshold: 5, resetTimeout: 60000 })
};

/**
 * Health check utilities
 */
const healthCheck = {
  database: async () => {
    const { db } = require('../config/connection');
    try {
      // Simple read operation to test database connectivity
      const start = Date.now();
      await db.collection('_health_check').limit(1).get();
      return { status: 'healthy', latency: Date.now() - start };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  },
  
  openai: async () => {
    try {
      const { openai } = require('../config/openAi');
      // Lightweight model list call to check API connectivity
      const start = Date.now();
      await openai.models.list();
      return { status: 'healthy', latency: Date.now() - start };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
};

/**
 * Network connectivity status
 */
const getConnectivityStatus = async () => {
  const services = ['database', 'openai'];
  const results = {};
  
  await Promise.all(services.map(async (service) => {
    try {
      results[service] = await healthCheck[service]();
    } catch (error) {
      results[service] = { status: 'unhealthy', error: error.message };
    }
  }));
  
  const overallHealthy = Object.values(results).every(r => r.status === 'healthy');
  
  return {
    overall: overallHealthy ? 'healthy' : 'degraded',
    services: results,
    timestamp: new Date().toISOString(),
    circuitBreakers: Object.keys(circuitBreakers).reduce((acc, key) => {
      acc[key] = circuitBreakers[key].getState();
      return acc;
    }, {})
  };
};

module.exports = {
  withRetry,
  withDatabaseRetry,
  withExternalAPIRetry,
  withOpenAIRetry,
  isRetryableError,
  CircuitBreaker,
  circuitBreakers,
  getConnectivityStatus,
  healthCheck,
  RETRY_CONFIGS
};
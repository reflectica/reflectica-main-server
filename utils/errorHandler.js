/**
 * Error handling utilities for consistent error responses
 */

class AppError extends Error {
  constructor(message, statusCode, code = null, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
  }
}

class DatabaseError extends AppError {
  constructor(message, originalError = null) {
    super(message, 500, 'DATABASE_ERROR');
    this.originalError = originalError;
  }
}

class ExternalServiceError extends AppError {
  constructor(service, message, originalError = null) {
    super(`${service} service error: ${message}`, 502, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
    this.originalError = originalError;
  }
}

class NetworkError extends AppError {
  constructor(message = 'Network connection failed') {
    super(message, 503, 'NETWORK_ERROR');
  }
}

/**
 * Creates user-friendly error responses
 */
const createErrorResponse = (error, includeStack = false) => {
  const response = {
    success: false,
    error: {
      message: error.message || 'An unexpected error occurred',
      code: error.code || 'UNKNOWN_ERROR',
      timestamp: error.timestamp || new Date().toISOString()
    }
  };

  if (error.field) {
    response.error.field = error.field;
  }

  if (error.service) {
    response.error.service = error.service;
  }

  if (includeStack && error.stack) {
    response.error.stack = error.stack;
  }

  return response;
};

/**
 * Handles async route errors
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Global error handler middleware
 */
const globalErrorHandler = (error, req, res, next) => {
  console.error('Error:', {
    message: error.message,
    code: error.code,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    url: req.url,
    method: req.method,
    body: req.body
  });

  // Handle operational errors
  if (error.isOperational) {
    return res.status(error.statusCode).json(createErrorResponse(error));
  }

  // Handle programming errors
  const statusCode = error.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Something went wrong' 
    : error.message;

  res.status(statusCode).json(createErrorResponse({
    message,
    code: error.code || 'INTERNAL_ERROR',
    timestamp: new Date().toISOString()
  }));
};

/**
 * Validates required fields in request body
 */
const validateRequiredFields = (fields, body) => {
  const missingFields = [];
  
  for (const field of fields) {
    if (!body[field] || (typeof body[field] === 'string' && body[field].trim() === '')) {
      missingFields.push(field);
    }
  }
  
  if (missingFields.length > 0) {
    throw new ValidationError(
      `Missing required fields: ${missingFields.join(', ')}`,
      missingFields[0]
    );
  }
};

/**
 * Handles database operation errors
 */
const handleDatabaseError = (error, operation = 'database operation') => {
  console.error(`Database error during ${operation}:`, error);
  
  if (error.code === 'permission-denied') {
    throw new DatabaseError('Access denied to database resource');
  }
  
  if (error.code === 'not-found') {
    throw new DatabaseError('Requested resource not found');
  }
  
  if (error.code === 'already-exists') {
    throw new DatabaseError('Resource already exists');
  }
  
  throw new DatabaseError(`Failed to ${operation}`);
};

/**
 * Handles external service errors with retry logic
 */
const handleExternalServiceError = (error, serviceName, operation = 'operation') => {
  console.error(`${serviceName} error during ${operation}:`, error);
  
  if (error.response) {
    const status = error.response.status;
    const message = error.response.data?.error?.message || error.message;
    
    if (status === 401 || status === 403) {
      throw new ExternalServiceError(serviceName, 'Authentication failed');
    }
    
    if (status === 429) {
      throw new ExternalServiceError(serviceName, 'Rate limit exceeded. Please try again later.');
    }
    
    if (status >= 500) {
      throw new ExternalServiceError(serviceName, 'Service temporarily unavailable');
    }
    
    throw new ExternalServiceError(serviceName, message);
  }
  
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    throw new NetworkError(`Unable to connect to ${serviceName}`);
  }
  
  throw new ExternalServiceError(serviceName, error.message || 'Unknown service error');
};

module.exports = {
  AppError,
  ValidationError,
  DatabaseError,
  ExternalServiceError,
  NetworkError,
  createErrorResponse,
  asyncHandler,
  globalErrorHandler,
  validateRequiredFields,
  handleDatabaseError,
  handleExternalServiceError
};
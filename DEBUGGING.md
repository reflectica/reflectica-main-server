# Debugging Guide for Clinicians

## Overview
This guide helps clinicians troubleshoot common issues and understand system behavior when patients report problems.

## Health Check Endpoints

### Basic Health Check
```
GET /health
```
Returns basic server status, uptime, and memory usage.

### Detailed Health Check  
```
GET /health/detailed
```
Returns comprehensive system information including CPU usage, platform details, and Node.js version.

## Log Storage
Logs are stored in two locations:
1. **Firestore Database** (primary) - Long-term retention with automatic cleanup:
   - Error logs: 90 days retention
   - Warning logs: 60 days retention  
   - Info/Debug logs: 30 days retention

2. **Local Files** (backup) - stored in `logs/` directory:
   - `error-YYYY-MM-DD.log` - Error messages and stack traces
   - `warn-YYYY-MM-DD.log` - Warning messages  
   - `info-YYYY-MM-DD.log` - General application events
   - `debug-YYYY-MM-DD.log` - Detailed debugging information

## Common Issues & Troubleshooting

### Patient Can't Connect to Chat
1. Check server health: `GET /health`
2. Look for connection errors in error logs
3. Verify user authentication status

### Audio/Voice Issues
1. Check audio route logs for OpenAI API errors
2. Verify API credentials and rate limits
3. Look for SDP processing errors in logs

### Session Not Saving
1. Check session route logs for database errors
2. Verify Firebase connectivity
3. Look for validation errors in user input

### Performance Issues
1. Monitor memory usage via health endpoint
2. Check response times in request logs
3. Look for database query timeouts

## Log Analysis Tips

### Error Identification
All logs include:
- Timestamp (ISO format)
- Log level (error, warn, info, debug)
- Structured metadata (userId, sessionId, etc.)
- Sanitized request details (sensitive data removed)

### Key Metadata Fields
- `userId` - Patient identifier
- `sessionId` - Therapy session identifier  
- `method` - HTTP method (GET, POST, etc.)
- `url` - Endpoint accessed
- `statusCode` - Response status
- `duration` - Request processing time

### Example Log Entry
```json
{
  "timestamp": "2024-01-20T10:30:00.000Z",
  "level": "error",
  "message": "AI processing failed",
  "userId": "user123",
  "sessionId": "session456", 
  "error": "OpenAI API timeout",
  "stack": "[REDACTED]"
}
```

## Environment Variables
- `LOG_LEVEL` - Controls logging verbosity (error, warn, info, debug)
- `NODE_ENV` - Environment mode (development, production)

## Firestore Setup
To enable automatic log cleanup, configure TTL (Time To Live) in Firebase Console:
1. Go to Firestore Database > Indexes
2. Create single-field index on `logs` collection, field `expiresAt`, with TTL enabled
3. Or run: `node scripts/setup-firestore-ttl.js` for instructions

## Contact Support
If issues persist after checking logs and health status, contact technical support with:
1. Timestamp of the issue
2. Patient/session identifiers (if available)
3. Error messages from logs
4. Health check results
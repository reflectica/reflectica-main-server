# Reflectica Main Server

**ALWAYS follow these instructions first** and only search for additional information if the details here are incomplete or found to be incorrect.

Reflectica is a Node.js Express server for an AI-powered therapy application. It provides chat endpoints with OpenAI integration, audio generation, session management, and user data persistence using Firebase and Pinecone vector search.

## Working Effectively

### Bootstrap and Setup
- Install Node.js dependencies:
  - `npm install` -- takes 12-15 seconds. NEVER CANCEL.
- **CRITICAL**: Application requires environment variables for external services:
  - Copy `.env.example` to `.env` and configure with real API keys
  - Required services: OpenAI API, Firebase Admin SDK, Pinecone vector database
  - **Application will fail immediately at startup without valid credentials**

### Environment Configuration (REQUIRED)
Create `.env` file with these variables:
```bash
# OpenAI Configuration  
OPENAI_API_KEY=your_openai_api_key_here

# Firebase Configuration (requires valid service account)
FIREBASE_TYPE_OF_ADMIN=service_account
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY_ID=your_private_key_id  
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key_here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_CLIENT_ID=your_client_id
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token
FIREBASE_AUTH_PROVIDER_CERT_URL=https://www.googleapis.com/oauth2/v1/certs
FIREBASE_CLIENT_CERT_URL=your_client_cert_url
FIREBASE_UNIVERSAL_DOMAIN=googleapis.com

# Pinecone Configuration
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_ENVIRONMENT=your_pinecone_environment

# Server Configuration
PORT=3006
NODE_ENV=development
```

### Build and Run
- Start development server:
  - `npm start` -- starts immediately with nodemon if environment is configured
  - Server runs on port 3006
  - **FAILS IMMEDIATELY** if Firebase credentials are invalid
- Test application health:
  - `curl http://localhost:3006/` should return "Hello, this is your server!"

### Testing
- **CRITICAL**: Tests require proper mocking due to external service dependencies
- Run tests: `npx jest --testTimeout=10000`
- **Test limitation**: Cannot run tests without valid environment setup due to Firebase initialization on module load
- Existing test files: `__tests__/chat-routes.test.js`, `__tests__/session-routes.test.js`
- Tests use Jest with Supertest for HTTP endpoint testing

### Docker Support
- **Issue**: Dockerfile uses `yarn` but project uses `npm` (package-lock.json exists, not yarn.lock)
- To use Docker: Update Dockerfile to use `npm` instead of `yarn`
- Docker build context: current directory
- Exposed port: 3006

## Validation Scenarios

### Manual Testing After Changes
**ALWAYS test these scenarios after making changes:**

1. **Server Health Check**:
   ```bash
   curl http://localhost:3006/
   # Expected: "Hello, this is your server!"
   ```

2. **Chat Endpoint** (requires valid OpenAI key):
   ```bash
   curl -X POST http://localhost:3006/chat \
     -H "Content-Type: application/json" \
     -d '{"prompt":"Hello","userId":"test","sessionId":"test","therapyMode":"CBT","sessionType":"individual"}'
   # Expected: JSON response with AI text and audio
   ```

3. **Session Endpoints**:
   ```bash
   curl -X POST http://localhost:3006/session/getAllSessions \
     -H "Content-Type: application/json" \
     -d '{"userId":"test"}'
   # Expected: JSON response with user sessions
   ```

### Common Issues and Solutions
- **"Failed to parse private key"**: Firebase private key is malformed in .env file
- **"Missing OPENAI_API_KEY"**: OpenAI API key not set in environment
- **Connection errors**: Check Pinecone and Firebase credentials
- **Tests failing**: Environment variables affect test imports, use proper mocking

## Project Structure

### Key Directories
- `/routes` -- Express route definitions (chat, session, user, dashboard, mail, audio)
- `/controllers` -- Business logic for handling requests
- `/config` -- Configuration for external services (OpenAI, Firebase, Pinecone)
- `/utils` -- Utility functions (text processing, mood analysis)
- `/__tests__` -- Jest test files

### Important Files
- `index.js` -- Main server entry point
- `package.json` -- Dependencies and scripts
- `jest.config.js` -- Test configuration
- `Dockerfile` -- Docker container definition (has yarn/npm mismatch)
- `.env.example` -- Template for environment variables

### Key Dependencies
- Express.js -- Web framework
- OpenAI -- AI text and audio generation
- Firebase Admin -- Database and authentication
- Pinecone -- Vector similarity search
- Jest/Supertest -- Testing framework

## Common Commands Reference

```bash
# Install dependencies (12-15 seconds)
npm install

# Start development server (immediate if configured)
npm start

# Run tests (requires environment setup)
npx jest

# Check application health
curl http://localhost:3006/

# Docker build (fix yarn/npm issue first)
docker build -t reflectica-server .
docker run -p 3006:3006 reflectica-server
```

## Limitations and Warnings
- **Cannot run without valid API credentials** for OpenAI, Firebase, and Pinecone
- **Tests cannot run in isolation** due to Firebase initialization during module loading
- **No linting or formatting scripts** are configured
- **Dockerfile has dependency manager mismatch** (uses yarn, should use npm)
- **External service costs** apply when using real API keys
- **Firebase credentials must be valid PEM format** or application fails immediately
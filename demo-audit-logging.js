/**
 * Demo script showing audit logging functionality
 * Run with: node demo-audit-logging.js
 */

const express = require('express');
const { auditPHIAccess, auditPHICreate, auditPHIUpdate, auditPHIDelete } = require('./middleware/auditMiddleware');

const app = express();
app.use(express.json());

// Demo PHI routes with audit logging
app.post('/demo/chat', auditPHICreate, (req, res) => {
  console.log(`\n🔒 [CHAT] Creating new therapy session conversation`);
  console.log(`   Request ID: ${req.requestId}`);
  res.json({ message: 'Chat session created', sessionId: 'demo-session-123' });
});

app.post('/demo/sessions', auditPHIAccess, (req, res) => {
  console.log(`\n📋 [SESSIONS] Retrieving user therapy sessions`);
  console.log(`   Request ID: ${req.requestId}`);
  res.json({ sessions: ['session-1', 'session-2', 'session-3'] });
});

app.post('/demo/dashboard', auditPHIAccess, (req, res) => {
  console.log(`\n📊 [DASHBOARD] Accessing mental health dashboard`);
  console.log(`   Request ID: ${req.requestId}`);
  res.json({ mentalHealthScore: 0.75, totalSessions: 5 });
});

app.post('/demo/user-update', auditPHIUpdate, (req, res) => {
  console.log(`\n👤 [USER] Updating user profile information`);
  console.log(`   Request ID: ${req.requestId}`);
  res.json({ message: 'User updated successfully' });
});

app.post('/demo/user-delete', auditPHIDelete, (req, res) => {
  console.log(`\n🗑️ [DELETE] Deleting all user data`);
  console.log(`   Request ID: ${req.requestId}`);
  res.json({ message: 'User data deletion initiated' });
});

const PORT = 3007;

console.log(`
🚀 Starting Audit Logging Demo Server...

This demo shows how PHI access attempts are logged with:
- WHO: User ID from request
- WHAT: Action type (CREATE, READ, UPDATE, DELETE)  
- WHEN: Timestamp with each request
- WHERE: Resource path/endpoint
- HOW: Success/failure result
- CONTEXT: IP, user-agent, request ID, metadata

📝 All logs are written to Firestore collection 'audit_logs'
🔐 PHI payloads are excluded - only safe identifiers logged

Demo routes available:
• POST /demo/chat (CREATE) - Start therapy conversation
• POST /demo/sessions (READ) - Get user sessions
• POST /demo/dashboard (READ) - Access mental health data
• POST /demo/user-update (UPDATE) - Update user profile
• POST /demo/user-delete (DELETE) - Delete user data

Example request:
curl -X POST http://localhost:${PORT}/demo/chat \\
  -H "Content-Type: application/json" \\
  -d '{"userId":"demo-user-123","sessionId":"session-456","therapyMode":"guided"}'
`);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Demo server running on http://localhost:${PORT}`);
    console.log('Press Ctrl+C to stop\n');
  });
}

module.exports = app;
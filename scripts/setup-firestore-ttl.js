/**
 * Script to set up Firestore TTL (Time To Live) for automatic log cleanup
 * 
 * This script should be run once to configure automatic deletion of logs
 * based on the expiresAt field in log documents.
 * 
 * Firestore TTL requires a single-field index on the TTL field.
 * 
 * To set up TTL:
 * 1. Go to Firebase Console > Firestore Database
 * 2. Navigate to Indexes tab
 * 3. Create a single-field index:
 *    - Collection: logs
 *    - Field: expiresAt
 *    - Enable TTL: Yes
 * 
 * Or use the Firebase CLI:
 * firebase firestore:indexes --project YOUR_PROJECT_ID
 * 
 * Add this to your firestore.indexes.json:
 * {
 *   "indexes": [],
 *   "fieldOverrides": [
 *     {
 *       "collectionGroup": "logs",
 *       "fieldPath": "expiresAt",
 *       "ttl": true,
 *       "indexes": [
 *         {
 *           "order": "ASCENDING",
 *           "queryScope": "COLLECTION"
 *         }
 *       ]
 *     }
 *   ]
 * }
 */

const { db } = require('../config/connection');

async function setupTTLIndex() {
  console.log('TTL setup requires manual configuration in Firebase Console or Firebase CLI');
  console.log('See comments in this file for instructions');
  
  // Test that we can write to the logs collection
  try {
    const testLog = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'TTL setup test',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
    };
    
    await db.collection('logs').add(testLog);
    console.log('✅ Successfully wrote test log to Firestore');
    console.log('⚠️  Remember to set up TTL index for automatic cleanup');
  } catch (error) {
    console.error('❌ Failed to write test log:', error.message);
  }
}

if (require.main === module) {
  setupTTLIndex().then(() => process.exit(0));
}

module.exports = { setupTTLIndex };
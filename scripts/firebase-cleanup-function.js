/**
 * Firebase Cloud Function for automatic log cleanup
 * Deploy this as a scheduled function to run weekly
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin (if not already done)
// initializeApp();
const db = getFirestore();

exports.cleanupLogs = onSchedule({
  schedule: 'every sunday 02:00',
  timeZone: 'America/New_York', // Adjust to your timezone
  memory: '256MiB',
  timeoutSeconds: 540 // 9 minutes
}, async (event) => {
  try {
    const now = new Date();
    console.log(`Starting scheduled log cleanup at ${now.toISOString()}`);

    let totalDeleted = 0;
    let hasMore = true;

    // Process in batches to avoid memory issues
    while (hasMore) {
      const expiredLogsQuery = await db.collection('logs')
        .where('expiresAt', '<=', now)
        .limit(500)
        .get();

      if (expiredLogsQuery.empty) {
        hasMore = false;
        break;
      }

      // Delete in batches
      const batch = db.batch();
      expiredLogsQuery.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      totalDeleted += expiredLogsQuery.size;

      console.log(`Deleted batch of ${expiredLogsQuery.size} logs (total: ${totalDeleted})`);

      // If we got less than the limit, we're done
      if (expiredLogsQuery.size < 500) {
        hasMore = false;
      }
    }

    console.log(`✅ Cleanup completed. Total deleted: ${totalDeleted} logs`);
    return { success: true, deletedCount: totalDeleted };

  } catch (error) {
    console.error('❌ Scheduled cleanup failed:', error);
    throw error; // This will trigger Cloud Function error reporting
  }
});

// Manual trigger for testing
exports.cleanupLogsManual = onSchedule({
  schedule: 'every 24 hours', // Won't actually run, just for manual trigger
  memory: '256MiB'
}, async (event) => {
  // Same logic as above, but can be triggered manually via Firebase Console
  return exports.cleanupLogs.handler(event);
});
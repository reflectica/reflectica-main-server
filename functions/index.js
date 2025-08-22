const {onSchedule} = require("firebase-functions/v2/scheduler");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

/**
 * Scheduled function to cleanup expired logs
 * Runs every Sunday at 2 AM Eastern Time
 */
exports.cleanupLogs = onSchedule({
  schedule: "every sunday 02:00",
  timeZone: "America/New_York",
  memory: "256MiB",
  timeoutSeconds: 540, // 9 minutes
  region: "us-central1",
}, async (event) => {
  try {
    const now = new Date();
    console.log(`🧹 Starting scheduled log cleanup at ${now.toISOString()}`);

    let totalDeleted = 0;
    let hasMore = true;
    const batchSize = 500;

    // Process in batches to avoid memory and timeout issues
    while (hasMore) {
      const expiredLogsQuery = await db.collection("logs")
          .where("expiresAt", "<=", now)
          .limit(batchSize)
          .get();

      if (expiredLogsQuery.empty) {
        console.log("No more expired logs found");
        hasMore = false;
        break;
      }

      // Delete in batch
      const batch = db.batch();
      expiredLogsQuery.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      totalDeleted += expiredLogsQuery.size;

      console.log(`Deleted batch of ${expiredLogsQuery.size} logs ` +
          `(total: ${totalDeleted})`);

      // If we got less than the limit, we're done
      if (expiredLogsQuery.size < batchSize) {
        hasMore = false;
      }

      // Add small delay to be gentle on Firestore
      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ Cleanup completed successfully. ` +
        `Total deleted: ${totalDeleted} logs`);

    // Return success metrics
    return {
      success: true,
      deletedCount: totalDeleted,
      timestamp: now.toISOString(),
    };
  } catch (error) {
    console.error("❌ Scheduled cleanup failed:", error);

    // This will trigger Cloud Function error reporting
    throw new Error(`Log cleanup failed: ${error.message}`);
  }
});

/**
 * Manual trigger for testing cleanup
 * Can be called from Firebase Console or via HTTP
 */
exports.cleanupLogsManual = onSchedule({
  schedule: "every 24 hours", // Placeholder schedule (won't auto-run)
  timeZone: "America/New_York",
  memory: "256MiB",
  timeoutSeconds: 540,
}, async (event) => {
  console.log("🔧 Manual log cleanup triggered");

  // Run the same cleanup logic as the scheduled function
  try {
    const now = new Date();
    console.log(`🧹 Starting manual log cleanup at ${now.toISOString()}`);

    let totalDeleted = 0;
    let hasMore = true;
    const batchSize = 500;

    while (hasMore) {
      const expiredLogsQuery = await db.collection("logs")
          .where("expiresAt", "<=", now)
          .limit(batchSize)
          .get();

      if (expiredLogsQuery.empty) {
        console.log("No more expired logs found");
        hasMore = false;
        break;
      }

      const batch = db.batch();
      expiredLogsQuery.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      totalDeleted += expiredLogsQuery.size;

      console.log(`Deleted batch of ${expiredLogsQuery.size} logs ` +
          `(total: ${totalDeleted})`);

      if (expiredLogsQuery.size < batchSize) {
        hasMore = false;
      }

      if (hasMore) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ Manual cleanup completed successfully. ` +
        `Total deleted: ${totalDeleted} logs`);

    return {
      success: true,
      deletedCount: totalDeleted,
      timestamp: now.toISOString(),
    };
  } catch (error) {
    console.error("❌ Manual cleanup failed:", error);
    throw new Error(`Manual cleanup failed: ${error.message}`);
  }
});

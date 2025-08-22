/**
 * Manual log cleanup script - alternative to TTL
 * Run this periodically (daily/weekly) to clean up expired logs
 */

const { db } = require('../config/connection');

async function cleanupExpiredLogs() {
  try {
    const now = new Date();
    console.log(`Starting log cleanup at ${now.toISOString()}`);

    // Query for expired logs
    const expiredLogsQuery = await db.collection('logs')
      .where('expiresAt', '<=', now)
      .limit(500) // Process in batches
      .get();

    if (expiredLogsQuery.empty) {
      console.log('No expired logs found');
      return;
    }

    // Delete expired logs in batch
    const batch = db.batch();
    let deleteCount = 0;

    expiredLogsQuery.forEach(doc => {
      batch.delete(doc.ref);
      deleteCount++;
    });

    await batch.commit();
    console.log(`✅ Deleted ${deleteCount} expired logs`);

    // If we hit the limit, there might be more - suggest running again
    if (deleteCount === 500) {
      console.log('⚠️  Batch limit reached - run script again to delete more');
    }

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
  }
}

// Show log count by retention period
async function showLogStats() {
  try {
    const now = new Date();
    const levels = ['error', 'warn', 'info', 'debug'];
    
    console.log('\n📊 Current log statistics:');
    
    for (const level of levels) {
      const snapshot = await db.collection('logs')
        .where('level', '==', level)
        .get();
      
      const expired = snapshot.docs.filter(doc => {
        const expiresAt = doc.data().expiresAt;
        return expiresAt && expiresAt.toDate() <= now;
      }).length;
      
      console.log(`${level}: ${snapshot.size} total, ${expired} expired`);
    }
  } catch (error) {
    console.error('Stats failed:', error.message);
  }
}

async function main() {
  console.log('🧹 Firestore Log Cleanup Tool\n');
  
  await showLogStats();
  await cleanupExpiredLogs();
  
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { cleanupExpiredLogs, showLogStats };
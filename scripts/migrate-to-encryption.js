#!/usr/bin/env node

/**
 * Migration script to encrypt existing PHI data in Firestore
 * 
 * This script will:
 * 1. Read existing unencrypted documents from Firestore
 * 2. Encrypt sensitive fields according to the encryption schema
 * 3. Update documents with encrypted data
 * 4. Verify encryption was successful
 * 
 * Usage: node scripts/migrate-to-encryption.js [--dry-run] [--collection=<name>] [--batch-size=<size>]
 */

const { admin } = require('../config/connection');
const EncryptedDataAccess = require('../utils/encrypted-data-access');
const { getEncryptedCollections, getEncryptionConfig } = require('../utils/encryption-schema');

class EncryptionMigration {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.batchSize = options.batchSize || 50;
    this.targetCollection = options.collection || null;
    
    this.db = admin.firestore();
    this.encryptedDataAccess = new EncryptedDataAccess();
    
    this.stats = {
      collections: 0,
      documentsProcessed: 0,
      documentsEncrypted: 0,
      documentsSkipped: 0,
      errors: 0
    };
  }

  /**
   * Run the migration
   */
  async migrate() {
    console.log('🔐 Starting PHI Encryption Migration');
    console.log(`Mode: ${this.dryRun ? 'DRY RUN' : 'LIVE MIGRATION'}`);
    console.log(`Batch size: ${this.batchSize}`);
    
    if (this.targetCollection) {
      console.log(`Target collection: ${this.targetCollection}`);
    }

    // Initialize KMS if not in dry run mode
    if (!this.dryRun) {
      await this.encryptedDataAccess.initializeKMS();
    }

    const collections = this.targetCollection 
      ? [this.targetCollection]
      : getEncryptedCollections();

    for (const collectionName of collections) {
      await this.migrateCollection(collectionName);
    }

    this.printSummary();
  }

  /**
   * Migrate a single collection
   */
  async migrateCollection(collectionName) {
    console.log(`\n📁 Processing collection: ${collectionName}`);
    
    const config = getEncryptionConfig(collectionName);
    if (!config) {
      console.log(`⚠️  No encryption config found for ${collectionName}, skipping`);
      return;
    }

    this.stats.collections++;

    try {
      // Get all documents in batches
      let lastDoc = null;
      let hasMore = true;
      let batchCount = 0;

      while (hasMore) {
        batchCount++;
        console.log(`  📦 Processing batch ${batchCount}...`);

        let query = this.db.collection(collectionName).limit(this.batchSize);
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();
        
        if (snapshot.empty) {
          hasMore = false;
          break;
        }

        await this.processBatch(collectionName, snapshot.docs);
        
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMore = snapshot.docs.length === this.batchSize;
      }

    } catch (error) {
      console.error(`❌ Error processing collection ${collectionName}:`, error);
      this.stats.errors++;
    }
  }

  /**
   * Process a batch of documents
   */
  async processBatch(collectionName, docs) {
    for (const doc of docs) {
      await this.processDocument(collectionName, doc);
    }
  }

  /**
   * Process a single document
   */
  async processDocument(collectionName, doc) {
    this.stats.documentsProcessed++;
    
    try {
      const data = doc.data();
      
      // Check if document is already encrypted
      if (data._encryption) {
        console.log(`  ⏭️  Document ${doc.id} already encrypted, skipping`);
        this.stats.documentsSkipped++;
        return;
      }

      // Check if document has any fields that need encryption
      const config = getEncryptionConfig(collectionName);
      const hasEncryptableFields = config.encryptedFields.some(field => 
        this.hasField(data, field)
      );

      if (!hasEncryptableFields) {
        console.log(`  ⏭️  Document ${doc.id} has no encryptable fields, skipping`);
        this.stats.documentsSkipped++;
        return;
      }

      if (this.dryRun) {
        console.log(`  🔍 [DRY RUN] Would encrypt document ${doc.id}`);
        this.logEncryptableFields(collectionName, data);
        this.stats.documentsEncrypted++;
      } else {
        // Perform actual encryption
        console.log(`  🔐 Encrypting document ${doc.id}...`);
        
        const encryptedData = await this.encryptedDataAccess.encryptDocument(
          collectionName, 
          doc.id, 
          data
        );

        // Update the document
        await doc.ref.set(encryptedData);
        
        console.log(`  ✅ Successfully encrypted document ${doc.id}`);
        this.stats.documentsEncrypted++;
      }

    } catch (error) {
      console.error(`  ❌ Error processing document ${doc.id}:`, error);
      this.stats.errors++;
    }
  }

  /**
   * Check if a document has a field (supports nested paths)
   */
  hasField(data, fieldPath) {
    const keys = fieldPath.split('.');
    let current = data;
    
    for (const key of keys) {
      if (!current || typeof current !== 'object' || !(key in current)) {
        return false;
      }
      current = current[key];
    }
    
    return current !== undefined && current !== null;
  }

  /**
   * Log which fields would be encrypted (for dry run)
   */
  logEncryptableFields(collectionName, data) {
    const config = getEncryptionConfig(collectionName);
    const encryptableFields = config.encryptedFields.filter(field => 
      this.hasField(data, field)
    );
    
    if (encryptableFields.length > 0) {
      console.log(`    📝 Fields to encrypt: ${encryptableFields.join(', ')}`);
    }
  }

  /**
   * Print migration summary
   */
  printSummary() {
    console.log('\n📊 Migration Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Collections processed: ${this.stats.collections}`);
    console.log(`Documents processed: ${this.stats.documentsProcessed}`);
    console.log(`Documents encrypted: ${this.stats.documentsEncrypted}`);
    console.log(`Documents skipped: ${this.stats.documentsSkipped}`);
    console.log(`Errors: ${this.stats.errors}`);
    
    if (this.stats.errors === 0) {
      console.log('✅ Migration completed successfully!');
    } else {
      console.log('⚠️  Migration completed with errors. Please review the error messages above.');
    }
  }

  /**
   * Verify encryption was successful
   */
  async verifyEncryption(collectionName, documentId) {
    try {
      const doc = await this.db.collection(collectionName).doc(documentId).get();
      
      if (!doc.exists) {
        return { success: false, error: 'Document not found' };
      }

      const data = doc.data();
      
      // Check if document has encryption metadata
      if (!data._encryption) {
        return { success: false, error: 'Document not encrypted' };
      }

      // Try to decrypt the document
      const decryptedData = await this.encryptedDataAccess.decryptDocument(
        collectionName, 
        documentId, 
        data
      );

      return { success: true, hasEncryptionMetadata: true, decryptionWorked: true };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    batchSize: 50,
    collection: null
  };

  // Parse arguments
  for (const arg of args) {
    if (arg.startsWith('--batch-size=')) {
      options.batchSize = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--collection=')) {
      options.collection = arg.split('=')[1];
    }
  }

  try {
    const migration = new EncryptionMigration(options);
    await migration.migrate();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = EncryptionMigration;
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path'); 
const EncryptedDataAccess = require('../utils/encrypted-data-access');

// dotenv.config({ path: path.join(__dirname, './.env') }); 
dotenv.config()

admin.initializeApp({
  credential: admin.credential.cert({
    "type": process.env.FIREBASE_TYPE_OF_ADMIN,
    "project_id": process.env.FIREBASE_PROJECT_ID,
    "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
    "private_key": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    "client_email": process.env.FIREBASE_CLIENT_EMAIL,
    "client_id": process.env.FIREBASE_CLIENT_ID,
    "auth_uri": process.env.FIREBASE_AUTH_URI,
    "token_uri": process.env.FIREBASE_TOKEN_URI,
    "auth_provider_x509_cert_url": process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
    "client_x509_cert_url": process.env.FIREBASE_CLIENT_CERT_URL,
    "universe_domain": process.env.FIREBASE_UNIVERSAL_DOMAIN
  }),
  // databaseURL: process.env.DATABASE_URL, // Replace with your Firestore database URL
});

const db = admin.firestore();

// Initialize encrypted data access
const encryptedDataAccess = new EncryptedDataAccess();

// Encrypted collection references that automatically handle encryption/decryption
class EncryptedCollectionReference {
  constructor(collectionName, encryptedDataAccess) {
    this.collectionName = collectionName;
    this.encryptedDataAccess = encryptedDataAccess;
    this.rawCollection = db.collection(collectionName);
  }

  /**
   * Add a document with automatic encryption
   */
  async add(data) {
    const result = await this.encryptedDataAccess.addDocument(this.collectionName, data);
    return {
      id: result.id,
      get: async () => {
        const docData = await this.encryptedDataAccess.getDocument(this.collectionName, result.id);
        return {
          id: result.id,
          data: () => docData,
          exists: !!docData
        };
      }
    };
  }

  /**
   * Get a document by ID with automatic decryption
   */
  doc(documentId) {
    return {
      id: documentId,
      get: async () => {
        const docData = await this.encryptedDataAccess.getDocument(this.collectionName, documentId);
        return {
          id: documentId,
          data: () => docData,
          exists: !!docData
        };
      },
      set: async (data, options = {}) => {
        await this.encryptedDataAccess.setDocument(this.collectionName, documentId, data, options);
      },
      update: async (updates) => {
        await this.encryptedDataAccess.updateDocument(this.collectionName, documentId, updates);
      },
      delete: async () => {
        await this.encryptedDataAccess.deleteDocument(this.collectionName, documentId);
      }
    };
  }

  /**
   * Create a query (WARNING: encrypted fields cannot be used in where clauses)
   */
  where(fieldPath, opStr, value) {
    return new EncryptedQuery(this.collectionName, this.encryptedDataAccess, (query) => 
      query.where(fieldPath, opStr, value)
    );
  }

  /**
   * Order by field (WARNING: encrypted fields cannot be used for ordering)
   */
  orderBy(fieldPath, directionStr) {
    return new EncryptedQuery(this.collectionName, this.encryptedDataAccess, (query) => 
      query.orderBy(fieldPath, directionStr)
    );
  }

  /**
   * Get all documents in the collection with automatic decryption
   */
  async get() {
    const docs = await this.encryptedDataAccess.queryDocuments(this.collectionName);
    return {
      docs: docs.map(doc => ({
        id: doc.id,
        data: () => {
          const { id, ...data } = doc;
          return data;
        },
        exists: true
      })),
      empty: docs.length === 0,
      forEach: (callback) => {
        docs.forEach((doc, index) => {
          callback({
            id: doc.id,
            data: () => {
              const { id, ...data } = doc;
              return data;
            },
            exists: true
          }, index);
        });
      }
    };
  }

  /**
   * Access the raw collection (bypasses encryption - use with caution)
   */
  getRawCollection() {
    console.warn(`getRawCollection() called for ${this.collectionName} - encryption bypassed!`);
    return this.rawCollection;
  }
}

class EncryptedQuery {
  constructor(collectionName, encryptedDataAccess, queryBuilder) {
    this.collectionName = collectionName;
    this.encryptedDataAccess = encryptedDataAccess;
    this.queryBuilder = queryBuilder;
  }

  where(fieldPath, opStr, value) {
    const previousBuilder = this.queryBuilder;
    return new EncryptedQuery(this.collectionName, this.encryptedDataAccess, (query) =>
      previousBuilder(query).where(fieldPath, opStr, value)
    );
  }

  orderBy(fieldPath, directionStr) {
    const previousBuilder = this.queryBuilder;
    return new EncryptedQuery(this.collectionName, this.encryptedDataAccess, (query) =>
      previousBuilder(query).orderBy(fieldPath, directionStr)
    );
  }

  limit(limit) {
    const previousBuilder = this.queryBuilder;
    return new EncryptedQuery(this.collectionName, this.encryptedDataAccess, (query) =>
      previousBuilder(query).limit(limit)
    );
  }

  async get() {
    const docs = await this.encryptedDataAccess.queryDocuments(this.collectionName, this.queryBuilder);
    return {
      docs: docs.map(doc => ({
        id: doc.id,
        data: () => {
          const { id, ...data } = doc;
          return data;
        },
        exists: true
      })),
      empty: docs.length === 0,
      forEach: (callback) => {
        docs.forEach((doc, index) => {
          callback({
            id: doc.id,
            data: () => {
              const { id, ...data } = doc;
              return data;
            },
            exists: true
          }, index);
        });
      }
    };
  }
}

// Create encrypted collection references
const sessionTextsRef = new EncryptedCollectionReference('sessionTexts', encryptedDataAccess);
const summaryRef = new EncryptedCollectionReference('summaries', encryptedDataAccess);
const subscribedEmails = new EncryptedCollectionReference('subscribedEmails', encryptedDataAccess);
const userRef = new EncryptedCollectionReference('users', encryptedDataAccess);

// Health check endpoint for encryption system
const getEncryptionHealth = async () => {
  return await encryptedDataAccess.healthCheck();
};

module.exports = {
  db,
  sessionTextsRef,
  summaryRef,
  subscribedEmails,
  userRef,
  admin,
  encryptedDataAccess,
  getEncryptionHealth
};
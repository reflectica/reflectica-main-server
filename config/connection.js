const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path'); 
// const serviceAccount = require('path/to/your/serviceAccountKey.json');
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

const sessionTextsRef = db.collection('sessionTexts');
const summaryRef = db.collection('summaries');
const subscribedEmails = db.collection("subscribedEmails");
const userRef = db.collection("users");

module.exports = {
  db,
  sessionTextsRef,
  summaryRef,
  subscribedEmails,
  userRef,
  admin
};
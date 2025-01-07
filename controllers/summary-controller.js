const { admin, summaryRef, db } = require('../config/connection'); // Import the admin and db instances

const registerSummary = async (userDocument, shortMessage, longMessage, emotions, normalizedScores, mentalHealthScore, referralRecommendation, sessionId, userId, chatLog) => {
  const timeStamp = admin.firestore.Timestamp.now(); // Use Firestore Timestamp

  const data = {
    userDocument: userDocument,
    shortSummary: shortMessage,
    longSummary: longMessage,
    emotions: emotions,
    normalizedScores: normalizedScores,
    mentalHealthScore: mentalHealthScore,
    referralRecommendation: referralRecommendation,
    time: timeStamp,
    sessionId: sessionId,
    uid: userId,
    chatlog: chatLog
  };

  // Add data to the collection
  summaryRef.add(data)
    .then((docRef) => {
      console.log('Document written with ID: ', docRef.id);
    })
    .catch((error) => {
      console.error('Error adding document: ', error);
    });
}

module.exports = { registerSummary };

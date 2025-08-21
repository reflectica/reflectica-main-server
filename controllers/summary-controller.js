const { admin, summaryRef, db } = require('../config/connection'); // Import the admin and db instances

const registerSummary = async (userDocument, shortMessage, longMessage, emotions, rawScores, normalizedScores, mentalHealthScore, referralRecommendation, sessionId, userId, chatLog) => {
  try {
    const timeStamp = admin.firestore.Timestamp.now(); // Use Firestore Timestamp

    const data = {
      userDocument: userDocument,
      shortSummary: shortMessage,
      longSummary: longMessage,
      emotions: emotions,
      rawScores: rawScores,
      normalizedScores: normalizedScores,
      mentalHealthScore: mentalHealthScore,
      referralRecommendation: referralRecommendation,
      time: timeStamp,
      sessionId: sessionId,
      uid: userId,
      chatlog: chatLog
    };

    // Add data to the collection
    await summaryRef.add(data)
      .then((docRef) => {
        console.log('Document written with ID: ', docRef.id);
      })
      .catch((error) => {
        console.error('Error adding document: ', error);
        throw new Error('Failed to save session summary');
      });
  } catch (error) {
    console.error('Error in registerSummary:', error);
    throw error;
  }
}

module.exports = { registerSummary };

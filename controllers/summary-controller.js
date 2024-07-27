const { summaryRef, sessionTextsRef } = require('../config/connection')

const registerSummary = async (userDocument, shortMessage, longMessage, emotions, normalizedScores, mentalHealthScore, sessionId, userId, chatLog) => {
  const timeStamp = new Date().toISOString();
  // Data to be added to the document
  const data = {
    userDocument: userDocument,
    shortSummary: shortMessage,
    longSummary: longMessage,
    emotions: emotions,
    normalizedScores: normalizedScores,
    mentalHealthScore: mentalHealthScore,
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

module.exports = { registerSummary }
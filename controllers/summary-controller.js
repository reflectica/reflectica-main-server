const { summaryRef, sessionTextsRef } = require('../config/connection')

const registerSummary = async (shortMessage, longMessage, moodPercentage, sessionId, userId, chatLog) => {
  const timeStamp = new Date().toISOString();
  // Data to be added to the document
  const data = {
    shortSummary: shortMessage,
    longSummary: longMessage,
    moodPercentage: moodPercentage,
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
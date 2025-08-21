const { summaryRef, sessionTextsRef, db } = require('../config/connection')
const { handleDatabaseError } = require('../utils/errorHandler')

const getTextFromSummaryTable = async (sessionId, uid) => {
  try {
    if (!sessionId || !uid) {
      throw new Error('sessionId and uid are required');
    }

    const result = await summaryRef.where("sessionId", "==", sessionId)
      .where("uid", "==", uid)
      .get()
      .then((querySnapshot) => {
        if (querySnapshot.empty) {
          console.log('No matching documents.');
          return null;
        }
        let returnData
        querySnapshot.forEach((doc) => {
          returnData = doc.data().chatLog
        });
        return returnData
      })

    return result
  } catch (error) {
    console.error('Error in getTextFromSummaryTable:', error);
    handleDatabaseError(error, 'retrieve text from summary table');
  }
}
  
const getTexts = async (uid, sessionId) => {
  try {
    if (!uid || !sessionId) {
      throw new Error('uid and sessionId are required');
    }

    const result = await sessionTextsRef.where("uid", '==', uid)
      .where("sessionId", "==", sessionId)
      .orderBy("time", 'asc')
      .get()
      .then((querySnapshot) => {
        if (querySnapshot.empty) {
          console.log('No matching documents.');
          return { chatlog: [], aiLog: null };
        }
        let resultObject;
        querySnapshot.forEach((doc) => {
          resultObject = { chatlog: doc.data().chatlog, aiLog: doc.data().message }
        });
        return resultObject
      })
      .catch((error) => {
        console.error('Error getting documents: ', error);
        throw error;
      });
    return result
  } catch (error) {
    console.error('Error in getTexts:', error);
    handleDatabaseError(error, 'retrieve session texts');
  }
}

const getTextsSeperated = async (uid, sessionId) => {
  try {
    const querySnapshot = await sessionTextsRef.where("uid", "==", uid)
      .where("sessionId", "==", sessionId)
      .orderBy("time", 'asc')
      .get();
    
    if (querySnapshot.empty) {
      console.log('No matching documents.');
      return { userLogs: [], aiLogs: [] }; // Return empty arrays if no documents found
    }

    let userLogs = [];
    let aiLogs = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();

      // Assuming chatlog contains both user and AI messages, you need to separate them
      data.chatlog.forEach(log => {
        if (log.role === 'user') {
          userLogs.push(log); // Add to userLogs if the role is 'user'
        } else if (log.role === 'assistant') {
          aiLogs.push(log); // Add to aiLogs if the role is 'assistant'
        }
      });

    });

    return { userLogs, aiLogs }; // Return the separated logs
  } catch (error) {
    console.error('Error getting documents: ', error);
    return { userLogs: [], aiLogs: [] }; // Return empty arrays in case of error
  }
};


const deleteAllTexts = async (uid,sessionId) => {
  await sessionTextsRef.where("uid", '==', uid)
  .where("sessionId", "==", sessionId)
  .get()
  .then((querySnapshot) => {
    if (querySnapshot.empty) {
      console.log('No matching documents to delete.');
      return;
    }

    // Create a batch for bulk deletion
    const batch = db.batch();

    querySnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Commit the batch to perform the deletion
    return batch.commit();
  })
  .then(() => {
    console.log('Bulk delete operation completed successfully.');
  })
  .catch((error) => {
    console.error('Error deleting documents: ', error);
  });
}

const addTextData = async (uid, role, transcript, sessionId) => {
  try {
    if (!uid || !role || !transcript || !sessionId) {
      throw new Error('uid, role, transcript, and sessionId are required');
    }

    const timeStamp = new Date().toISOString();

    // Data to be added or updated in the document
    const dataToUpdate = {
      uid: uid,
      time: timeStamp, // Consider if you need to update time for every message
      sessionId: sessionId,
      chatlog: [{ role: role, content: transcript }] // Array of chat logs
    };

    await sessionTextsRef.where("sessionId", "==", sessionId).where("uid", "==", uid)
      .get()
      .then(async (querySnapshot) => {
        if (querySnapshot.empty) {
          // If no existing session, add a new document
          await sessionTextsRef.add(dataToUpdate);
          console.log("New session document created");
        } else {
          // If session exists, update the chatlog array
          querySnapshot.forEach(async (doc) => {
            await doc.ref.update({
              // Optionally update 'time' here if you want the latest message timestamp
              chatlog: [...doc.data().chatlog, { role: role, content: transcript }]
            });
            console.log("Document updated successfully");
          });
        }
      })
      .catch((error) => {
        console.error('Error adding or updating document: ', error);
        throw error;
      });
  } catch (error) {
    console.error('Error in addTextData:', error);
    handleDatabaseError(error, 'add text data');
  }
};

module.exports = {
  getTextFromSummaryTable,
  getTexts,
  getTextsSeperated,
  deleteAllTexts,
  addTextData
}
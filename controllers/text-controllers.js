const { summaryRef, sessionTextsRef } = require('../config/connection')

const getTextFromSummaryTable = async (sessionId, uid) => {
  try {
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
        console.log(returnData)
        return returnData
      })
      .catch((error) => {
        console.error('Error getting documents from summary table: ', error);
        throw new Error('Database query failed');
      });

    return result;
  } catch (error) {
    console.error('Error in getTextFromSummaryTable:', error);
    throw error;
  }
}
  
const getTexts = async (uid, sessionId) => {
  const result = await sessionTextsRef.where("uid", '==', uid)
    .where("sessionId", "==", sessionId)
    .orderBy("time", 'asc')
    .get()
    .then((querySnapshot) => {
      if (querySnapshot.empty) {
        console.log('No matching documents.');
        return;
      }
      let resultObject;
      querySnapshot.forEach((doc) => {
        console.log(doc.data())
        resultObject = { chatlog: doc.data().chatlog, aiLog: doc.data().message }
      });
      return resultObject
    })
    .catch((error) => {
      console.error('Error getting documents: ', error);
    });
  return result
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
      console.log(data);

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


const deleteAllTexts = async (uid, sessionId) => {
  try {
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
        throw new Error('Failed to delete session texts');
      });
  } catch (error) {
    console.error('Error in deleteAllTexts:', error);
    throw error;
  }
}

const addTextData = async (uid, role, transcript, sessionId) => {
  try {
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
        throw new Error('Failed to save text data');
      });
  } catch (error) {
    console.error('Error in addTextData:', error);
    throw error;
  }
};

module.exports = {
  getTextFromSummaryTable,
  getTexts,
  getTextsSeperated,
  deleteAllTexts,
  addTextData
}
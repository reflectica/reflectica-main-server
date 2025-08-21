const { summaryRef, sessionTextsRef } = require('../config/connection')

const getTextFromSummaryTable = async (sessionId, uid) => {
  try {
    if (!sessionId || !uid) {
      throw new Error('Session ID and User ID are required');
    }

    const result = await summaryRef.where("sessionId", "==", sessionId)
      .where("uid", "==", uid)
      .get();
      
    if (result.empty) {
      console.log('No matching documents found for session:', sessionId);
      return null;
    }
    
    let returnData;
    result.forEach((doc) => {
      returnData = doc.data().chatLog;
    });
    
    console.log('Retrieved summary data for session:', sessionId);
    return returnData;
    
  } catch (error) {
    console.error('Error retrieving summary data:', error);
    throw new Error(`Failed to retrieve session summary: ${error.message}`);
  }
}
  
const getTexts = async (uid, sessionId) => {
  try {
    if (!uid || !sessionId) {
      throw new Error('User ID and Session ID are required');
    }

    const querySnapshot = await sessionTextsRef.where("uid", '==', uid)
      .where("sessionId", "==", sessionId)
      .orderBy("time", 'asc')
      .get();
      
    if (querySnapshot.empty) {
      console.log('No conversation data found for session:', sessionId);
      return { chatlog: [], aiLog: null };
    }
    
    let resultObject;
    querySnapshot.forEach((doc) => {
      console.log('Retrieved session document:', doc.id);
      resultObject = { chatlog: doc.data().chatlog, aiLog: doc.data().message };
    });
    
    return resultObject;
    
  } catch (error) {
    console.error('Error retrieving conversation data:', error);
    throw new Error(`Failed to retrieve conversation: ${error.message}`);
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
    if (!uid || !sessionId) {
      throw new Error('User ID and Session ID are required');
    }

    const querySnapshot = await sessionTextsRef.where("uid", '==', uid)
      .where("sessionId", "==", sessionId)
      .get();
      
    if (querySnapshot.empty) {
      console.log('No documents found to delete for session:', sessionId);
      return;
    }

    // Create a batch for bulk deletion
    const { db } = require('../config/connection');
    const batch = db.batch();

    querySnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Commit the batch to perform the deletion
    await batch.commit();
    console.log('Successfully deleted session data for:', sessionId);
    
  } catch (error) {
    console.error('Error deleting session data:', error);
    throw new Error(`Failed to delete session data: ${error.message}`);
  }
}

const addTextData = async (uid, role, transcript, sessionId) => {
  try {
    if (!uid || !role || !transcript || !sessionId) {
      throw new Error('All parameters (uid, role, transcript, sessionId) are required');
    }

    if (!['user', 'assistant'].includes(role)) {
      throw new Error('Role must be either "user" or "assistant"');
    }

    const timeStamp = new Date().toISOString();

    // Data to be added or updated in the document
    const dataToUpdate = {
      uid: uid,
      time: timeStamp,
      sessionId: sessionId,
      chatlog: [{ role: role, content: transcript }]
    };

    const querySnapshot = await sessionTextsRef.where("sessionId", "==", sessionId)
      .where("uid", "==", uid)
      .get();
      
    if (querySnapshot.empty) {
      // If no existing session, add a new document
      await sessionTextsRef.add(dataToUpdate);
      console.log("New session document created for:", sessionId);
    } else {
      // If session exists, update the chatlog array
      const updatePromises = [];
      querySnapshot.forEach((doc) => {
        const updatePromise = doc.ref.update({
          chatlog: [...doc.data().chatlog, { role: role, content: transcript }]
        });
        updatePromises.push(updatePromise);
      });
      
      await Promise.all(updatePromises);
      console.log("Session document updated successfully for:", sessionId);
    }
    
  } catch (error) {
    console.error('Error adding text data:', error);
    throw new Error(`Failed to save message: ${error.message}`);
  }
};

module.exports = {
  getTextFromSummaryTable,
  getTexts,
  getTextsSeperated,
  deleteAllTexts,
  addTextData
}
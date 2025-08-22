const { summaryRef, sessionTextsRef, db } = require('../config/connection')
const { handleDatabaseError } = require('../utils/errorHandler')
const { withDatabaseRetry } = require('../utils/networkReliability')
const logger = require('../utils/logger')

const getTextFromSummaryTable = async (sessionId, uid) => {
  try {
    if (!sessionId || !uid) {
      throw new Error('sessionId and uid are required');
    }

    const context = { sessionId, uid, operation: 'getTextFromSummaryTable' };

    const result = await withDatabaseRetry(async () => {
      const querySnapshot = await summaryRef.where("sessionId", "==", sessionId)
        .where("uid", "==", uid)
        .get();

      if (querySnapshot.empty) {
        logger.debug('No matching documents in summary table', context);
        return null;
      }

      let returnData;
      querySnapshot.forEach((doc) => {
        returnData = doc.data().chatLog;
      });
      
      return returnData;
    }, context);

    return result;
  } catch (error) {
    logger.error('Error in getTextFromSummaryTable', { 
      error: error.message, 
      sessionId, 
      uid,
      stack: error.stack 
    });
    handleDatabaseError(error, 'retrieve text from summary table');
  }
}
  
const getTexts = async (uid, sessionId) => {
  try {
    if (!uid || !sessionId) {
      throw new Error('uid and sessionId are required');
    }

    const context = { uid, sessionId, operation: 'getTexts' };

    const result = await withDatabaseRetry(async () => {
      const querySnapshot = await sessionTextsRef.where("uid", '==', uid)
        .where("sessionId", "==", sessionId)
        .orderBy("time", 'asc')
        .get();

      if (querySnapshot.empty) {
        logger.debug('No matching session texts found', context);
        return { chatlog: [], aiLog: null };
      }

      let resultObject;
      querySnapshot.forEach((doc) => {
        resultObject = { chatlog: doc.data().chatlog, aiLog: doc.data().message };
      });
      
      return resultObject;
    }, context);

    return result;
  } catch (error) {
    logger.error('Error in getTexts', { 
      error: error.message, 
      uid, 
      sessionId,
      stack: error.stack 
    });
    handleDatabaseError(error, 'retrieve session texts');
  }
}

const getTextsSeperated = async (uid, sessionId) => {
  try {
    const context = { uid, sessionId, operation: 'getTextsSeperated' };

    const result = await withDatabaseRetry(async () => {
      const querySnapshot = await sessionTextsRef.where("uid", "==", uid)
        .where("sessionId", "==", sessionId)
        .orderBy("time", 'asc')
        .get();
      
      if (querySnapshot.empty) {
        logger.debug('No matching documents for separated logs', context);
        return { userLogs: [], aiLogs: [] };
      }

      let userLogs = [];
      let aiLogs = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();

        // Separate user and AI messages from chatlog
        data.chatlog.forEach(log => {
          if (log.role === 'user') {
            userLogs.push(log);
          } else if (log.role === 'assistant') {
            aiLogs.push(log);
          }
        });
      });

      return { userLogs, aiLogs };
    }, context);

    return result;
  } catch (error) {
    logger.error('Error in getTextsSeperated', { 
      error: error.message, 
      uid, 
      sessionId,
      stack: error.stack 
    });
    return { userLogs: [], aiLogs: [] }; // Return empty arrays in case of error
  }
};


const deleteAllTexts = async (uid, sessionId) => {
  try {
    const context = { uid, sessionId, operation: 'deleteAllTexts' };

    await withDatabaseRetry(async () => {
      const querySnapshot = await sessionTextsRef.where("uid", '==', uid)
        .where("sessionId", "==", sessionId)
        .get();

      if (querySnapshot.empty) {
        logger.debug('No matching documents to delete', context);
        return;
      }

      // Create a batch for bulk deletion
      const batch = db.batch();
      let deleteCount = 0;

      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
        deleteCount++;
      });

      // Commit the batch to perform the deletion
      await batch.commit();
      
      logger.info('Bulk delete operation completed successfully', { 
        ...context, 
        deletedCount: deleteCount 
      });
    }, context);
  } catch (error) {
    logger.error('Error in deleteAllTexts', { 
      error: error.message, 
      uid, 
      sessionId,
      stack: error.stack 
    });
    throw error; // Re-throw to maintain existing error handling behavior
  }
}

const addTextData = async (uid, role, transcript, sessionId) => {
  try {
    if (!uid || !role || !transcript || !sessionId) {
      throw new Error('uid, role, transcript, and sessionId are required');
    }

    const context = { uid, role, sessionId, operation: 'addTextData' };
    const timeStamp = new Date().toISOString();

    await withDatabaseRetry(async () => {
      const querySnapshot = await sessionTextsRef
        .where("sessionId", "==", sessionId)
        .where("uid", "==", uid)
        .get();

      if (querySnapshot.empty) {
        // If no existing session, add a new document
        const dataToCreate = {
          uid: uid,
          time: timeStamp,
          sessionId: sessionId,
          chatlog: [{ role: role, content: transcript }]
        };

        await sessionTextsRef.add(dataToCreate);
        logger.info("New session document created", context);
      } else {
        // If session exists, update the chatlog array
        const promises = [];
        querySnapshot.forEach((doc) => {
          const updatePromise = doc.ref.update({
            time: timeStamp, // Update timestamp for latest message
            chatlog: [...doc.data().chatlog, { role: role, content: transcript }]
          });
          promises.push(updatePromise);
        });

        await Promise.all(promises);
        logger.info("Session document updated successfully", context);
      }
    }, context);
  } catch (error) {
    logger.error('Error in addTextData', { 
      error: error.message, 
      uid, 
      role,
      sessionId,
      stack: error.stack 
    });
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
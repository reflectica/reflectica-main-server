const Sentiment = require('sentiment');
const AWS = require('aws-sdk');
const axios = require('axios');
const { summaryRef, sessionTextsRef } = require('../config/connection')
const sentiment = new Sentiment();


const emailAllUserTranscripts = async (userId) => {
  const allTranscriptsForUser = await summaryRef.where("uid", "==", userId)
  .get().then((querySnapshot) => {
    if (querySnapshot.empty) {
      console.log('No matching documents.');
      return;
    }

    let returnData = ""
    querySnapshot.forEach((doc) => {
      console.log("doc data",doc.data())
      const stringSession = `${JSON.stringify(doc.data().chatlog)} \n`
      console.log("stringSession",stringSession)
      returnData += stringSession
    });
    console.log("returnData",returnData)
    return returnData
  })
  await sendUserTranscriptsAfterDeletion(userId, allTranscriptsForUser)
  return
}

const userEmotions = async (data) => {
  try {
    const response = await axios.post(
      'https://onq4bqqdrk.execute-api.us-east-2.amazonaws.com/bert', 
      data,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error('Error:', error.response ? error.response.statusText : error.message);
    throw new Error(`HTTP error! status: ${error.response ? error.response.status : 'unknown'}`);
  }
};

const sendUserTranscriptsAfterDeletion = async (userId, userTranscript) => {
  console.log("userTranscripts",userTranscript)
  const mailOptions = {
    from: 'reflectica.ai@gmail.com',
    to: 'reflectica.ai@gmail.com',
    subject: `Account Deleted: ${userId}`,
    text: `${userTranscript}`,
  };

  await transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });
}

const getAllUserSessions = async (userId) => {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const result = await summaryRef.where("uid", '==', userId)
    .where('time', '>=', firstDayOfMonth.toISOString())
    .where('time', '<=', lastDayOfMonth.toISOString())
    .orderBy("time", 'desc')
    .get()
    .then((querySnapshot) => {
      if (querySnapshot.empty) {
        console.log('No matching documents.');
        return;
      }
      const resultArray = []
      querySnapshot.forEach((doc) => {
        resultArray.push(doc.data())
      });
      return { summaryData: resultArray, totalSessions: resultArray.length}
    })
    .catch((error) => {
      console.error('Error getting documents: ', error);
    });
  return result
}

const deleteAllUserSummaries = async (uid) => {
  await summaryRef.where("uid", "==", uid)
  .get()
  .then((querySnapshot) => {
    if (querySnapshot.empty) {
      console.log('No matching documents to delete.');
      return;
    }

    const batch = db.batch();

    querySnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
    return batch.commit();
  })
  .then(() => {
    console.log('Bulk delete operation completed successfully.');
  })
  .catch((error) => {
    console.error('Error deleting documents: ', error);
  });

  await userRef.where("uid", "==", uid)
  .get()
  .then((querySnapshot) => {
    if (querySnapshot.empty) {
      console.log('No matching documents to delete.');
      return;
    }

    const batch = db.batch();

    querySnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    return batch.commit();
  })
  .then(() => {
    console.log('Bulk delete operation completed successfully.');
  })
  .catch((error) => {
    console.error('Error deleting documents: ', error);
  });
}
const updateFieldInUserCollection = async (userId, value, fieldName) => {
  const userDocument = userRef.doc(userId)

  await userDocument.update({
    [fieldName]: value
  })
  .then(() => console.log("updated the doc"))
  .catch((e) => console.log(e))
}

const checkForExistingData = async (email) => {
  const q = await subscribedEmails.where("email", "==", email).get()
    .then((querySnapshot) => {
      return querySnapshot.empty
    })
  return q;
};

const getSentiment = async (uid, sessionId) => {
  try {
    const querySnapshot = await sessionTextsRef
      .where("uid", '==', uid)
      .where("sessionId", "==", sessionId)
      .orderBy("time", 'asc')
      .get();

    if (querySnapshot.empty) {
      console.log('No matching documents.');
      return;
    }
    const userMessages = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      data.chatlog.forEach((item) => {
        if (item.role === "user") {
          userMessages.push(item.content)
        }
      })
    });
    
    const joinedMessages = userMessages.join('.')
    const analyze = sentiment.analyze(joinedMessages)
    if(analyze.score < -5) return -5
    if(analyze.score > 5) return 5
    return analyze.score
  } catch (error) {
    console.error('Error getting documents: ', error);
  }
}


module.exports = {
  emailAllUserTranscripts,
  getAllUserSessions,
  deleteAllUserSummaries,
  updateFieldInUserCollection,
  checkForExistingData,
  getSentiment,
  userEmotions
}
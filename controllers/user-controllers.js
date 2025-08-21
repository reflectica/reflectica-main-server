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
        timeout: 10000, // 10 second timeout
      }
    );

    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error('Error analyzing emotions:', error.response ? error.response.statusText : error.message);
    
    // Provide fallback response for emotion analysis
    if (error.code === 'ECONNABORTED') {
      throw new Error('Emotion analysis timed out. Please try again.');
    } else if (error.response && error.response.status >= 500) {
      throw new Error('Emotion analysis service is temporarily unavailable.');
    } else if (error.response && error.response.status === 429) {
      throw new Error('Too many requests to emotion analysis service. Please try again later.');
    } else {
      throw new Error('Unable to analyze emotions at this time.');
    }
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
  try {
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
          return { summaryData: [], totalSessions: 0 };
        }
        const resultArray = []
        querySnapshot.forEach((doc) => {
          resultArray.push(doc.data())
        });
        return { summaryData: resultArray, totalSessions: resultArray.length}
      })
      .catch((error) => {
        console.error('Error getting documents: ', error);
        throw new Error('Failed to retrieve user sessions');
      });
    return result;
  } catch (error) {
    console.error('Error in getAllUserSessions:', error);
    throw error;
  }
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

const parseScores = (dsmScore) => {
  const lines = dsmScore.split('\n');
  const scores = {};

  lines.forEach(line => {
    const [key, value] = line.split(': ');
    scores[key.trim()] = value === 'Not Applicable' ? 'Not Applicable' : parseInt(value.trim(), 10);
  });

  return scores;
};

// Function to normalize scores
const normalizeScores = (scores) => {
  const ranges = {
    'PHQ-9 Score': [0, 27],
    'GAD-7 Score': [0, 21],
    'CBT Behavioral Activation': [0, 7],
    'Rosenberg Self Esteem': [10, 40],
    'PSQI Score': [0, 21],
    'SFQ Score': [0, 32],
    'PSS Score': [0, 40],
    'SSRS Assessment': [0, 5],
  };

  const normalizedScores = {};
  for (const key in scores) {
    if (scores[key] === 'Not Applicable') {
      normalizedScores[key] = 'Not Applicable';
    } else {
      const [min, max] = ranges[key];
      normalizedScores[key] = ((scores[key] - min) / (max - min)) * 10;
    }
  }

  return normalizedScores;
};


const calculateMentalHealthScore = (scores) => {
  const weights = {
    'PHQ-9 Score': 3,
    'GAD-7 Score': 3,
    'CBT Behavioral Activation': 2,
    'Rosenberg Self Esteem': 1,
    'PSQI Score': 2,
    'SFQ Score': 2,
    'PSS Score': 1,
    'SSRS Assessment': 1,
  };

  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const key in scores) {
    if (scores[key] !== 'Not Applicable' && !isNaN(scores[key])) {
      totalWeightedScore += scores[key] * weights[key];
      totalWeight += weights[key];
    }
  }
  return 10 - (totalWeightedScore / totalWeight);
};





module.exports = {
  emailAllUserTranscripts,
  getAllUserSessions,
  deleteAllUserSummaries,
  updateFieldInUserCollection,
  checkForExistingData,
  getSentiment,
  userEmotions,
  parseScores,
  calculateMentalHealthScore,
  normalizeScores
}
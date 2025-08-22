const Sentiment = require('sentiment');
const AWS = require('aws-sdk');
const axios = require('axios');
const { summaryRef, sessionTextsRef } = require('../config/connection')
const { handleDatabaseError, handleExternalServiceError } = require('../utils/errorHandler')
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
      const stringSession = `${JSON.stringify(doc.data().chatlog)} \n`
      returnData += stringSession
    });
    return returnData
  })
  await sendUserTranscriptsAfterDeletion(userId, allTranscriptsForUser)
  return
}

const userEmotions = async (data) => {
  try {
    if (!data) {
      throw new Error('Data is required for emotion analysis');
    }

    const response = await axios.post(
      'https://onq4bqqdrk.execute-api.us-east-2.amazonaws.com/bert', 
      data,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 second timeout
      }
    );

    console.log("Emotion analysis completed successfully");
    return response.data;
  } catch (error) {
    console.error('Emotion analysis service failed, using default neutral response:', error.message);
    
    // Return default neutral emotion response in correct format
    return [
      { "label": "neutral", "score": 1.0 },
      { "label": "sadness", "score": 0.0 },
      { "label": "joy", "score": 0.0 },
      { "label": "anger", "score": 0.0 },
      { "label": "fear", "score": 0.0 },
      { "label": "surprise", "score": 0.0 },
      { "label": "disgust", "score": 0.0 },
      { "label": "disappointment", "score": 0.0 },
      { "label": "grief", "score": 0.0 },
      { "label": "remorse", "score": 0.0 },
      { "label": "annoyance", "score": 0.0 },
      { "label": "disapproval", "score": 0.0 },
      { "label": "caring", "score": 0.0 },
      { "label": "realization", "score": 0.0 },
      { "label": "nervousness", "score": 0.0 },
      { "label": "optimism", "score": 0.0 },
      { "label": "approval", "score": 0.0 },
      { "label": "desire", "score": 0.0 },
      { "label": "love", "score": 0.0 },
      { "label": "admiration", "score": 0.0 },
      { "label": "curiosity", "score": 0.0 },
      { "label": "amusement", "score": 0.0 },
      { "label": "confusion", "score": 0.0 },
      { "label": "excitement", "score": 0.0 },
      { "label": "relief", "score": 0.0 },
      { "label": "gratitude", "score": 0.0 },
      { "label": "embarrassment", "score": 0.0 },
      { "label": "pride", "score": 0.0 }
    ];
  }
};

const sendUserTranscriptsAfterDeletion = async (userId, userTranscript) => {
  console.log("Sending user deletion notification for user:", userId);
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

const getAllUserSessions = async (userId, startDate, endDate) => {
  try {
    if (!userId) {
      throw new Error('userId is required');
    }

    // If no date range provided, default to current month
    let firstDay, lastDay;
    if (startDate && endDate) {
      firstDay = new Date(startDate);
      lastDay = new Date(endDate);
    } else {
      const today = new Date();
      firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    }
    
    const result = await summaryRef.where("uid", '==', userId)
      .where('time', '>=', firstDay.toISOString())
      .where('time', '<=', lastDay.toISOString())
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
        throw error;
      });
    return result
  } catch (error) {
    console.error('Error in getAllUserSessions:', error);
    handleDatabaseError(error, 'retrieve user sessions');
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
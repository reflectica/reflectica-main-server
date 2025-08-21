const route = require('express').Router()
const { callOpenAi } = require('../config/openAi')
const { getAllUserSessions, getSentiment, userEmotions, parseScores, calculateMentalHealthScore, normalizeScores } = require('../controllers/user-controllers')
const { getTexts, getTextFromSummaryTable, deleteAllTexts } = require('../controllers/text-controllers')
const { registerSummary } = require('../controllers/summary-controller')
const { upsertChunksWithEmbeddings } = require('../config/pinecone')
const { createEmbeddings } = require('../config/openAi')
const { askForShortSummary, askForin5LongSummary, askForin3LongSummary, askForUserProfile, askForDSMScores, askForDSMScoresSpanish, englishToSpanish } = require('../utils/text')
const { moodTable } = require('../utils/mood')

route.post("/getAllSessions", async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        error: 'User ID is required',
        message: 'Please provide a valid user ID to retrieve sessions.' 
      });
    }

    const getAllSessionsForUser = await getAllUserSessions(userId);
    res.send({ sessions: getAllSessionsForUser })
  } catch (error) {
    console.error('Error retrieving user sessions:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve sessions',
      message: 'Unable to load your session history. Please try again later.' 
    });
  }
})

route.post("/getSessionTranscripts", async (req, res) => {
  try {
    const { sessionId, userId } = req.body;
    
    if (!sessionId || !userId) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        message: 'Session ID and User ID are required to retrieve transcripts.' 
      });
    }

    const getAllTranscriptsForSessions = await getTextFromSummaryTable(userId, sessionId)
    res.send(getAllTranscriptsForSessions)
  } catch (error) {
    console.error('Error retrieving session transcripts:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve transcripts',
      message: 'Unable to load session transcripts. Please try again later.' 
    });
  }
})

route.post("/endSession", async (req, res) => {
  try {
    const { userId, sessionId, language, sessionType } = req.body;
    
    // Input validation
    if (!userId || !sessionId) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        message: 'User ID and Session ID are required to end a session.' 
      });
    }

    // Get session data with error handling
    let getData;
    try {
      getData = await getTexts(userId, sessionId);
      if (!getData || !getData.chatlog || getData.chatlog.length === 0) {
        return res.status(404).json({ 
          error: 'Session not found',
          message: 'No conversation data found for this session.' 
        });
      }
    } catch (error) {
      console.error('Error retrieving session data:', error);
      return res.status(500).json({ 
        error: 'Failed to retrieve session data',
        message: 'Unable to access your session. Please try again later.' 
      });
    }

    const userMessages = getData.chatlog
      .filter(entry => entry.role === 'user')
      .map(entry => entry.content)
      .join(' ');

    const fullSessionTranscript = getData.chatlog
      .map(entry => `[${entry.role}] ${entry.content}`)
      .join('\n');

    let cleanedText = userMessages.replace(/\n/g, ' ');
    const spanishTranscipt = getData.chatlog.concat(englishToSpanish);
    
    // Build question prompts
    const shortSummaryQuestion = getData.chatlog.concat(askForShortSummary);
    const userDocumentQuestion = getData.chatlog.concat(askForUserProfile);
    let dsmScoreQuestion;
    if (language === 'es-ES') {
      dsmScoreQuestion = getData.chatlog.concat(askForDSMScoresSpanish);
    } else {
      dsmScoreQuestion = getData.chatlog.concat(askForDSMScores);
    }

    let longSummaryQuestion;
    if (getData.chatlog.length >= 10) {
      longSummaryQuestion = getData.chatlog.concat(askForin5LongSummary);
    } else {
      longSummaryQuestion = getData.chatlog.concat(askForin3LongSummary);
    }

    // Process AI calls with error handling and fallbacks
    let analyzeUser, shortSummary, dsmScore, userDocument, longSummary, englishTranscript, emotions, referralRecommendation;
    
    try {
      // Critical AI processing with individual error handling
      try {
        analyzeUser = await getSentiment(userId, sessionId);
      } catch (error) {
        console.error('Error analyzing sentiment:', error);
        analyzeUser = 0; // Default neutral sentiment
      }

      try {
        englishTranscript = await callOpenAi(spanishTranscipt);
      } catch (error) {
        console.error('Error translating transcript:', error);
        englishTranscript = cleanedText; // Fallback to original text
      }

      try {
        shortSummary = await callOpenAi(shortSummaryQuestion);
      } catch (error) {
        console.error('Error generating short summary:', error);
        shortSummary = "Session summary unavailable - processing error occurred.";
      }

      try {
        dsmScore = await callOpenAi(dsmScoreQuestion);
      } catch (error) {
        console.error('Error generating DSM scores:', error);
        dsmScore = "PHQ-9 Score: Not Available\nGAD-7 Score: Not Available\nCBT Behavioral Activation: Not Available\nRosenberg Self Esteem: Not Available\nPSQI Score: Not Available\nSFQ Score: Not Available\nPSS Score: Not Available\nSSRS Assessment: Not Available";
      }

      try {
        userDocument = await callOpenAi(userDocumentQuestion);
      } catch (error) {
        console.error('Error generating user document:', error);
        userDocument = "User profile unavailable - processing error occurred.";
      }

      try {
        longSummary = await callOpenAi(longSummaryQuestion);
      } catch (error) {
        console.error('Error generating long summary:', error);
        longSummary = "Detailed session summary unavailable - processing error occurred.";
      }

      // Handle emotions based on language with error handling
      try {
        const querySpanish = {"text": englishTranscript}
        if (language === 'es-ES') {
          emotions = await userEmotions(JSON.stringify(querySpanish));
        } else {
          emotions = await userEmotions(JSON.stringify({ text: cleanedText }));
        }
      } catch (error) {
        console.error('Error analyzing emotions:', error);
        emotions = { error: "Emotion analysis unavailable" }; // Fallback emotions
      }

      // Process scores with error handling
      let rawScores, normalizedScores, mentalHealthScore;
      try {
        rawScores = parseScores(dsmScore);
        normalizedScores = normalizeScores(rawScores);
        mentalHealthScore = calculateMentalHealthScore(normalizedScores).toFixed(2);
      } catch (error) {
        console.error('Error processing mental health scores:', error);
        rawScores = {};
        normalizedScores = {};
        mentalHealthScore = "N/A";
      }

      // Generate referral recommendation with error handling
      try {
        const referralPrompt = [
          {
            role: "system",
            content: `You are a mental health referral bot. Analyze the following DSM scores and patient transcript to recommend a specialized therapy. Choose from the following areas:
            
            1. Depression/Anxiety
            2. Trauma and PTSD
            3. Family and Relationship Issues
            4. Substance Abuse/Addiction
            5. Grief and Loss

            DSM Scores: ${JSON.stringify(rawScores)}

            Transcript: ${userMessages}

            At the end of your response, include the entire session transcript.

            Respond in this format:
            
            Recommended Specialization: [Specialization]
            Reason: [Explanation based on DSM scores and transcript]
            Summary for Clinicians: [Concise summary of the patient's current situation]
            Severity Assessment (1-5): [Number indicating current severity level, 5 = most critical]
            Priority Ranking (1-5): [Number indicating how urgently care is needed, 5 = most urgent]

            Full Session Transcript: [The entire session transcript here, exactly as provided below.]

            =====

            Full Session Transcript to Include:
            ${fullSessionTranscript}
            `
          }
        ];

        referralRecommendation = await callOpenAi(referralPrompt);
      } catch (error) {
        console.error('Error generating referral recommendation:', error);
        referralRecommendation = "Referral recommendation unavailable - please consult with a mental health professional for appropriate care guidance.";
      }

      const userMoodPercentage = moodTable[`${analyzeUser}`];
      
      // Save summary with error handling
      try {
        await registerSummary(userDocument, shortSummary, longSummary, emotions, normalizedScores, rawScores, mentalHealthScore, referralRecommendation, sessionId, userId, getData.chatlog);
      } catch (error) {
        console.error('Error saving session summary:', error);
        // Continue execution - this is not critical for the response
      }

      // Clean up session data with error handling
      try {
        await deleteAllTexts(userId, sessionId);
      } catch (error) {
        console.error('Error cleaning up session data:', error);
        // Continue execution - this is not critical for the response
      }

      console.log({
        chatlog: getData.chatlog,
        shortSummary: shortSummary,
        dsmScore: dsmScore,
        longSummary: longSummary,
        sessionId: sessionId,
        mood: userMoodPercentage,
        referral: referralRecommendation,
      });

      // Send successful response
      res.send({
        chatlog: getData.chatlog,
        shortSummary: shortSummary,
        longSummary: longSummary,
        sessionId: sessionId,
        mood: userMoodPercentage,
        emotions: emotions,
        rawScores: rawScores,
        normalizedScores: normalizedScores,
        mentalHealthScore: mentalHealthScore,
        referral: referralRecommendation,
      });

    } catch (error) {
      console.error('Critical error during session processing:', error);
      res.status(500).json({ 
        error: 'Session processing failed',
        message: 'We encountered an issue processing your session. Your conversation has been saved, but some analysis features may be unavailable. Please contact support if this persists.' 
      });
    }

  } catch (error) {
    console.error('Unexpected error in endSession:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'An unexpected error occurred. Please try again later or contact support if the issue persists.' 
    });
  }
});

module.exports = route;
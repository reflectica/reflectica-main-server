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
    
    if (!getAllSessionsForUser) {
      return res.status(200).json({ 
        sessions: [], 
        message: 'No sessions found for this user.' 
      });
    }

    res.status(200).json({ sessions: getAllSessionsForUser });
  } catch (error) {
    console.error('Error retrieving user sessions:', error);
    res.status(500).json({ 
      error: 'Unable to retrieve sessions', 
      message: 'There was an issue retrieving your sessions. Please try again later.' 
    });
  }
})

route.post("/getSessionTranscripts", async (req, res) => {
  try {
    const { sessionId, userId } = req.body;
    
    if (!sessionId || !userId) {
      return res.status(400).json({ 
        error: 'Missing required parameters', 
        message: 'Both session ID and user ID are required to retrieve transcripts.' 
      });
    }

    const getAllTranscriptsForSessions = await getTextFromSummaryTable(userId, sessionId);
    
    if (!getAllTranscriptsForSessions) {
      return res.status(404).json({ 
        error: 'Transcripts not found', 
        message: 'No transcripts found for this session.' 
      });
    }

    res.status(200).json(getAllTranscriptsForSessions);
  } catch (error) {
    console.error('Error retrieving session transcripts:', error);
    res.status(500).json({ 
      error: 'Unable to retrieve transcripts', 
      message: 'There was an issue retrieving the session transcripts. Please try again later.' 
    });
  }
})

route.post("/endSession", async (req, res) => {
  try {
    const { userId, sessionId, language, sessionType } = req.body;
    
    // Validate required parameters
    if (!userId || !sessionId) {
      return res.status(400).json({ 
        error: 'Missing required parameters', 
        message: 'User ID and session ID are required to end a session.' 
      });
    }

    // Get session data with error handling
    let getData;
    try {
      getData = await getTexts(userId, sessionId);
      if (!getData || !getData.chatlog || getData.chatlog.length === 0) {
        return res.status(404).json({ 
          error: 'Session not found', 
          message: 'No session data found for the provided session ID.' 
        });
      }
    } catch (error) {
      console.error('Error retrieving session data:', error);
      return res.status(500).json({ 
        error: 'Unable to retrieve session data', 
        message: 'There was an issue retrieving your session data. Please try again later.' 
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
    
    // Call OpenAI APIs with error handling
    let englishTranscript, shortSummary, dsmScore, userDocument, longSummary;
    try {
      englishTranscript = await callOpenAi(spanishTranscipt);
    } catch (error) {
      console.error('Error translating to English:', error);
      englishTranscript = userMessages; // Fallback to original text
    }

    const queryData = { "inputs": userMessages };
    const queryEmotions = { "text": userMessages };
    console.log("queryemotions", queryEmotions)
    const querySpanish = {"text": englishTranscript}

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

    // Analyze user sentiment with error handling
    let analyzeUser;
    try {
      analyzeUser = await getSentiment(userId, sessionId);
    } catch (error) {
      console.error('Error analyzing sentiment:', error);
      analyzeUser = 0; // Fallback to neutral sentiment
    }

    // Generate summaries and scores with error handling
    try {
      shortSummary = await callOpenAi(shortSummaryQuestion);
    } catch (error) {
      console.error('Error generating short summary:', error);
      shortSummary = 'Session Summary'; // Fallback summary
    }

    try {
      dsmScore = await callOpenAi(dsmScoreQuestion);
    } catch (error) {
      console.error('Error generating DSM scores:', error);
      dsmScore = 'PHQ-9 Score: Not Applicable\nGAD-7 Score: Not Applicable\nCBT Behavioral Activation: Not Applicable\nRosenberg Self Esteem: Not Applicable\nPSQI Score: Not Applicable\nSFQ Score: Not Applicable\nPSS Score: Not Applicable\nSSRS Assessment: Not Applicable'; // Fallback scores
    }

    try {
      userDocument = await callOpenAi(userDocumentQuestion);
    } catch (error) {
      console.error('Error generating user document:', error);
      userDocument = 'User profile could not be generated'; // Fallback document
    }

    try {
      longSummary = await callOpenAi(longSummaryQuestion);
    } catch (error) {
      console.error('Error generating long summary:', error);
      longSummary = 'Detailed summary could not be generated'; // Fallback summary
    }

    // Handle emotions based on language with error handling
    let emotions;
    try {
      if (language === 'es-ES') {
        emotions = await userEmotions(JSON.stringify(querySpanish));
      } else {
        emotions = await userEmotions(JSON.stringify({ text: cleanedText }));
      }
    } catch (error) {
      console.error('Error analyzing emotions:', error);
      emotions = { emotions: 'Unable to analyze emotions' }; // Fallback emotions
    }

    // Process scores with error handling
    let rawScores, normalizedScores, mentalHealthScore;
    try {
      rawScores = parseScores(dsmScore);
      normalizedScores = normalizeScores(rawScores);
      mentalHealthScore = calculateMentalHealthScore(normalizedScores).toFixed(2);
    } catch (error) {
      console.error('Error processing scores:', error);
      rawScores = {};
      normalizedScores = {};
      mentalHealthScore = 'N/A';
    }

    // Create the referral prompt by combining DSM scores and user messages
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

    // Call OpenAI with the combined prompt to get the referral recommendation
    let referralRecommendation;
    try {
      referralRecommendation = await callOpenAi(referralPrompt);
    } catch (error) {
      console.error('Error generating referral recommendation:', error);
      referralRecommendation = 'Referral recommendation could not be generated'; // Fallback referral
    }

    // Log results for debugging
    console.log("Referral Recommendation:", referralRecommendation);

    const userMoodPercentage = moodTable[`${analyzeUser}`];
    
    // Register summary with error handling
    try {
      await registerSummary(userDocument, shortSummary, longSummary, emotions, normalizedScores, rawScores, mentalHealthScore, referralRecommendation, sessionId, userId, getData.chatlog);
    } catch (error) {
      console.error('Error registering summary:', error);
      // Continue execution even if summary registration fails
    }

    // Delete session texts with error handling
    try {
      await deleteAllTexts(userId, sessionId);
    } catch (error) {
      console.error('Error deleting session texts:', error);
      // Continue execution even if deletion fails
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

    // Send response including referral recommendation
    res.status(200).json({
      chatlog: getData.chatlog,
      shortSummary: shortSummary,
      longSummary: longSummary,
      sessionId: sessionId,
      mood: userMoodPercentage,
      emotions: emotions,
      rawScores: rawScores,
      normalizedScores: normalizedScores,
      mentalHealthScore: mentalHealthScore,
      referral: referralRecommendation, // Include referral recommendation in the response
    });

  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({ 
      error: 'Unable to end session', 
      message: 'There was an issue processing your session. Please try again later.' 
    });
  }
});

module.exports = route;
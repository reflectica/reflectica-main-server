const route = require('express').Router()
const { callOpenAi } = require('../config/openAi')
const { getAllUserSessions, getSentiment, userEmotions, parseScores, calculateMentalHealthScore, normalizeScores } = require('../controllers/user-controllers')
const { getTexts, getTextFromSummaryTable, deleteAllTexts } = require('../controllers/text-controllers')
const { registerSummary } = require('../controllers/summary-controller')
const { upsertChunksWithEmbeddings } = require('../config/pinecone')
const { createEmbeddings } = require('../config/openAi')
const { askForShortSummary, askForin5LongSummary, askForin3LongSummary, askForUserProfile, askForDSMScores, askForDSMScoresSpanish, englishToSpanish } = require('../utils/text')
const { moodTable } = require('../utils/mood')
const { sessionTextsRef } = require('../config/connection')
const { 
  generateSessionId, 
  isValidSessionId, 
  validateSessionAccess, 
  getSessionStats 
} = require('../utils/sessionUtils')
const { 
  asyncHandler, 
  validateRequiredFields, 
  handleDatabaseError, 
  handleExternalServiceError,
  createErrorResponse,
  validateUserId
} = require('../utils/errorHandler')

route.post("/createSession", asyncHandler(async (req, res) => {
  validateRequiredFields(['userId'], req.body);
  
  const userId = validateUserId(req.body.userId);
  
  try {
    const sessionId = generateSessionId();
    
    res.json({ 
      success: true,
      sessionId: sessionId,
      message: 'Session created successfully'
    });
  } catch (error) {
    handleDatabaseError(error, 'create session');
  }
}))

route.post("/validateSession", asyncHandler(async (req, res) => {
  validateRequiredFields(['userId', 'sessionId'], req.body);
  
  const userId = validateUserId(req.body.userId);
  const { sessionId } = req.body;
  
  try {
    // Validate session ID format
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json(createErrorResponse({
        message: 'Invalid session ID format',
        code: 'INVALID_SESSION_ID'
      }));
    }
    
    // Check if user has access to this session
    const hasAccess = await validateSessionAccess(userId, sessionId, sessionTextsRef);
    
    if (!hasAccess) {
      return res.status(403).json(createErrorResponse({
        message: 'User does not have access to this session',
        code: 'SESSION_ACCESS_DENIED'
      }));
    }
    
    // Get session statistics
    const stats = await getSessionStats(sessionId, sessionTextsRef);
    
    res.json({ 
      success: true,
      valid: true,
      stats: stats
    });
  } catch (error) {
    handleDatabaseError(error, 'validate session');
  }
}))

route.post("/cleanupSessions", asyncHandler(async (req, res) => {
  validateRequiredFields(['userId'], req.body);
  
  const userId = validateUserId(req.body.userId);
  const { maxAge } = req.body;
  const maxAgeHours = maxAge || 24; // Default to 24 hours
  
  try {
    const cutoffTime = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000)).toISOString();
    
    const querySnapshot = await sessionTextsRef
      .where("uid", "==", userId)
      .where("time", "<", cutoffTime)
      .get();
    
    if (querySnapshot.empty) {
      return res.json({
        success: true,
        message: 'No old sessions found to cleanup',
        cleanedSessions: 0
      });
    }
    
    const batch = sessionTextsRef.firestore.batch();
    let cleanedCount = 0;
    
    querySnapshot.forEach(doc => {
      batch.delete(doc.ref);
      cleanedCount++;
    });
    
    await batch.commit();
    
    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} old sessions`,
      cleanedSessions: cleanedCount
    });
  } catch (error) {
    handleDatabaseError(error, 'cleanup sessions');
  }
}))

route.post("/getAllSessions", asyncHandler(async (req, res) => {
  validateRequiredFields(['userId'], req.body);
  
  const userId = validateUserId(req.body.userId);
  const { startDate, endDate } = req.body;
  
  try {
    const getAllSessionsForUser = await getAllUserSessions(userId, startDate, endDate);
    res.json({ 
      success: true,
      sessions: getAllSessionsForUser 
    });
  } catch (error) {
    handleDatabaseError(error, 'retrieve user sessions');
  }
}))

route.post("/getSessionTranscripts", asyncHandler(async (req, res) => {
  validateRequiredFields(['sessionId', 'userId'], req.body);
  
  const userId = validateUserId(req.body.userId);
  const { sessionId } = req.body;
  
  // Validate session ID format
  if (!isValidSessionId(sessionId)) {
    return res.status(400).json(createErrorResponse({
      message: 'Invalid session ID format',
      code: 'INVALID_SESSION_ID'
    }));
  }

  // Validate user access to session
  const hasAccess = await validateSessionAccess(userId, sessionId, sessionTextsRef);
  if (!hasAccess) {
    return res.status(403).json(createErrorResponse({
      message: 'User does not have access to this session',
      code: 'SESSION_ACCESS_DENIED'
    }));
  }
  
  try {
    const getAllTranscriptsForSessions = await getTextFromSummaryTable(userId, sessionId);
    res.json({
      success: true,
      data: getAllTranscriptsForSessions
    });
  } catch (error) {
    handleDatabaseError(error, 'retrieve session transcripts');
  }
}))

route.post("/endSession", asyncHandler(async (req, res) => {
  validateRequiredFields(['userId', 'sessionId', 'language', 'sessionType'], req.body);
  
  const userId = validateUserId(req.body.userId);
  const { sessionId, language, sessionType } = req.body;
  
  // Validate session ID format
  if (!isValidSessionId(sessionId)) {
    return res.status(400).json(createErrorResponse({
      message: 'Invalid session ID format',
      code: 'INVALID_SESSION_ID'
    }));
  }

  // Validate user access to session
  const hasAccess = await validateSessionAccess(userId, sessionId, sessionTextsRef);
  if (!hasAccess) {
    return res.status(403).json(createErrorResponse({
      message: 'User does not have access to this session',
      code: 'SESSION_ACCESS_DENIED'
    }));
  }
  
  try {
    // Step 1: Retrieve session data
    let getData;
    try {
      getData = await getTexts(userId, sessionId);
      if (!getData || !getData.chatlog || getData.chatlog.length === 0) {
        return res.status(404).json(createErrorResponse({
          message: 'No session data found for the provided userId and sessionId',
          code: 'SESSION_NOT_FOUND'
        }));
      }
    } catch (error) {
      handleDatabaseError(error, 'retrieve session data');
    }

    // Step 2: Process chat messages
    const userMessages = getData.chatlog
      .filter(entry => entry.role === 'user')
      .map(entry => entry.content)
      .join(' ');

    const fullSessionTranscript = getData.chatlog
      .map(entry => `[${entry.role}] ${entry.content}`)
      .join('\n');

    if (!userMessages.trim()) {
      return res.status(400).json(createErrorResponse({
        message: 'Session contains no user messages to process',
        code: 'NO_USER_MESSAGES'
      }));
    }

    let cleanedText = userMessages.replace(/\n/g, ' ');
    const spanishTranscipt = getData.chatlog.concat(englishToSpanish);
    
    // Step 3: Prepare OpenAI queries
    const queryData = { "inputs": userMessages };
    const queryEmotions = { "text": userMessages };
    const querySpanish = {"text": cleanedText}; // Will be updated after translation
    
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

    // Step 4: Process sentiment analysis
    let analyzeUser;
    try {
      analyzeUser = await getSentiment(userId, sessionId);
    } catch (error) {
      console.warn('Failed to analyze user sentiment:', error);
      analyzeUser = 0; // Default neutral sentiment
    }

    // Step 5: Generate AI responses with error handling
    let shortSummary, dsmScore, userDocument, longSummary, englishTranscript;
    
    try {
      // Execute OpenAI calls with proper error handling
      const promises = [
        callOpenAi(shortSummaryQuestion).catch(err => {
          handleExternalServiceError(err, 'OpenAI', 'generate short summary');
        }),
        callOpenAi(dsmScoreQuestion).catch(err => {
          handleExternalServiceError(err, 'OpenAI', 'generate DSM scores');
        }),
        callOpenAi(userDocumentQuestion).catch(err => {
          handleExternalServiceError(err, 'OpenAI', 'generate user document');
        }),
        callOpenAi(longSummaryQuestion).catch(err => {
          handleExternalServiceError(err, 'OpenAI', 'generate long summary');
        })
      ];

      // Add translation call if needed
      if (language === 'es-ES') {
        promises.push(callOpenAi(spanishTranscipt).catch(err => {
          handleExternalServiceError(err, 'OpenAI', 'translate to English');
        }));
      }

      const results = await Promise.all(promises);
      [shortSummary, dsmScore, userDocument, longSummary] = results;
      
      if (language === 'es-ES') {
        englishTranscript = results[4];
        querySpanish.text = englishTranscript;
      }

    } catch (error) {
      // If any OpenAI call fails, we still want to provide some response
      console.error('OpenAI processing failed:', error);
      throw error;
    }

    // Step 6: Handle emotions analysis
    let emotions;
    try {
      if (language === 'es-ES') {
        emotions = await userEmotions(JSON.stringify(querySpanish));
      } else {
        emotions = await userEmotions(JSON.stringify({ text: cleanedText }));
      }
    } catch (error) {
      console.warn('Failed to analyze user emotions:', error);
      handleExternalServiceError(error, 'Emotion Analysis', 'analyze user emotions');
    }

    // Step 7: Process scores with error handling
    let rawScores, normalizedScores, mentalHealthScore;
    try {
      rawScores = parseScores(dsmScore);
      normalizedScores = normalizeScores(rawScores);
      mentalHealthScore = calculateMentalHealthScore(normalizedScores).toFixed(2);
    } catch (error) {
      console.warn('Failed to process mental health scores:', error);
      rawScores = {};
      normalizedScores = {};
      mentalHealthScore = '0.00';
    }

    // Step 8: Generate referral recommendation
    let referralRecommendation = '';
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
      console.warn('Failed to generate referral recommendation:', error);
      referralRecommendation = 'Unable to generate referral recommendation at this time. Please review session manually.';
    }

    const userMoodPercentage = moodTable[`${analyzeUser}`] || 'Unknown';

    // Step 9: Save summary with error handling
    try {
      await registerSummary(
        userDocument, 
        shortSummary, 
        longSummary, 
        emotions, 
        normalizedScores, 
        rawScores, 
        mentalHealthScore, 
        referralRecommendation, 
        sessionId, 
        userId, 
        getData.chatlog
      );
    } catch (error) {
      handleDatabaseError(error, 'save session summary');
    }

    // Step 10: Clean up session data
    try {
      await deleteAllTexts(userId, sessionId);
    } catch (error) {
      console.warn('Failed to delete session texts:', error);
      // Don't fail the entire request if cleanup fails
    }

    console.log("Session ended successfully", {
      sessionId: sessionId,
      userId: userId,
      messageCount: getData.chatlog ? getData.chatlog.length : 0,
      mood: userMoodPercentage,
      hasReferral: !!referralRecommendation,
    });

    // Step 11: Send successful response
    res.json({
      success: true,
      data: {
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
      }
    });

  } catch (error) {
    console.error('Error in endSession:', error);
    throw error; // This will be caught by asyncHandler and sent to global error handler
  }
}));

module.exports = route;
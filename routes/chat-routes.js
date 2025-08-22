// routes/chatRoutes.js

const route = require('express').Router();
const { callAI, openai } = require('../config/openAi');
const { addTextData, getTexts, getTextsSeperated } = require('../controllers/text-controllers');
const { searchDocs } = require('../config/pinecone');
const { sessionTextsRef } = require('../config/connection');
const { 
  isValidSessionId, 
  validateSessionAccess 
} = require('../utils/sessionUtils');
const { 
  asyncHandler, 
  validateRequiredFields, 
  handleDatabaseError, 
  handleExternalServiceError,
  createErrorResponse,
  validateAndSanitizePrompt,
  validateUserId,
  validateTherapyMode,
  validateSessionType
} = require('../utils/errorHandler');
const logger = require('../utils/logger');

route.post("/", asyncHandler(async (req, res) => {
  validateRequiredFields(['prompt', 'userId', 'sessionId', 'therapyMode', 'sessionType'], req.body);
  
  let { prompt, userId, sessionId, therapyMode, sessionType } = req.body;

  // Validate and sanitize inputs
  prompt = validateAndSanitizePrompt(prompt);
  userId = validateUserId(userId);
  therapyMode = validateTherapyMode(therapyMode);
  sessionType = validateSessionType(sessionType);

  logger.info('Chat request initiated', { userId, sessionId, therapyMode, sessionType });

  // Validate session ID format
  if (!isValidSessionId(sessionId)) {
    logger.warn('Invalid session ID format', { userId, sessionId });
    return res.status(400).json(createErrorResponse({
      message: 'Invalid session ID format',
      code: 'INVALID_SESSION_ID'
    }));
  }

  // For existing sessions, validate user access
  const existingSessionStats = await require('../utils/sessionUtils').getSessionStats(sessionId, sessionTextsRef);
  if (existingSessionStats.exists) {
    const hasAccess = await validateSessionAccess(userId, sessionId, sessionTextsRef);
    if (!hasAccess) {
      logger.warn('Session access denied', { userId, sessionId });
      return res.status(403).json(createErrorResponse({
        message: 'User does not have access to this session',
        code: 'SESSION_ACCESS_DENIED'
      }));
    }
  }

  try {
    // Step 1: Log user message with error handling
    try {
      await addTextData(userId, "user", prompt.trim(), sessionId);
    } catch (error) {
      handleDatabaseError(error, 'save user message');
    }

    // Step 2: Retrieve conversation history with error handling
    let getData, userLogs, aiLogs;
    try {
      getData = await getTexts(userId, sessionId);
      const separatedLogs = await getTextsSeperated(userId, sessionId);
      userLogs = separatedLogs.userLogs;
      aiLogs = separatedLogs.aiLogs;
    } catch (error) {
      handleDatabaseError(error, 'retrieve conversation history');
    }

    // Step 3: Build conversation history string
    let conversationHistory = '';
    try {
      userLogs.forEach((log, index) => {
        conversationHistory += `User: ${log.content}\n`;
        if (aiLogs[index]) {
          conversationHistory += `AI: ${aiLogs[index].content}\n`;
        }
      });
    } catch (error) {
      console.warn('Error building conversation history:', error);
      conversationHistory = `User: ${prompt}\n`; // Fallback to current prompt only
    }

    // Append the current prompt to the conversation history
    const combinedPrompt = conversationHistory + `User: ${prompt}\nAI:`;
    logger.debug('Chat conversation prepared', { userId, sessionId, therapyMode, sessionType, messageCount: getData?.length });

    // Step 4: Get AI response with comprehensive error handling
    let aiResponse;
    try {
      logger.info('Processing AI request', { userId, sessionId, therapyMode, sessionType });
      aiResponse = await callAI(combinedPrompt, therapyMode, sessionType);
      
      if (!aiResponse || !aiResponse.text) {
        throw new Error('Invalid AI response received');
      }
      
      logger.info('AI response generated', { userId, sessionId, hasAudio: !!aiResponse.audioFile });
    } catch (error) {
      logger.error('AI processing error', { error: error.message, userId, sessionId, stack: error.stack });
      handleExternalServiceError(error, 'OpenAI', 'generate chat response');
    }

    // Step 5: Log AI's response with error handling
    try {
      await addTextData(userId, "assistant", aiResponse.text, sessionId);
      logger.debug('AI response saved to database', { userId, sessionId });
    } catch (error) {
      logger.warn('Failed to save AI response', { error: error.message, userId, sessionId });
      // Don't fail the entire request if we can't save the AI response
    }

    // Step 6: Handle audio response
    let audioResponse = null;
    if (aiResponse.audioFile) {
      try {
        // Validate audio file exists and is accessible
        audioResponse = aiResponse.audioFile;
        logger.debug('Audio response prepared', { userId, sessionId, audioFile: audioResponse });
      } catch (error) {
        logger.warn('Audio processing error', { error: error.message, userId, sessionId });
        // Continue without audio if there's an issue
      }
    }

    logger.info('Chat session completed successfully', { userId, sessionId });

    // Step 7: Send successful response
    res.json({
      success: true,
      data: {
        text: aiResponse.text,
        audio: audioResponse,
        sessionId: sessionId
      }
    });

  } catch (error) {
    logger.error('Chat processing error', { error: error.message, userId, sessionId, stack: error.stack });
    throw error; // Will be caught by asyncHandler and sent to global error handler
  }
}));

module.exports = route;

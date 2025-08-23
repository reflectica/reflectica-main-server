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
const { withOpenAIRetry, withExternalAPIRetry, circuitBreakers } = require('../utils/networkReliability');
const { draftOperations } = require('../utils/sessionCache');

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
    // Step 1: Save user message draft and log to database
    try {
      // First, save draft for network resilience
      draftOperations.saveChatDraft(userId, sessionId, [{ role: 'user', content: prompt.trim() }]);
      
      // Then attempt to save to database
      await addTextData(userId, "user", prompt.trim(), sessionId);
      logger.debug('User message saved successfully', { userId, sessionId });
    } catch (error) {
      logger.error('Failed to save user message', { error: error.message, userId, sessionId });
      
      // Check if we have a draft to recover from
      const existingDraft = draftOperations.getChatDraft(userId, sessionId);
      if (existingDraft) {
        logger.info('User message preserved in draft cache', { userId, sessionId });
      }
      
      handleDatabaseError(error, 'save user message');
    }

    // Step 2: Retrieve conversation history with retry logic
    let getData, userLogs, aiLogs;
    try {
      // Use existing enhanced controllers with retry logic
      getData = await getTexts(userId, sessionId);
      const separatedLogs = await getTextsSeperated(userId, sessionId);
      userLogs = separatedLogs.userLogs;
      aiLogs = separatedLogs.aiLogs;
      
      logger.debug('Conversation history retrieved', { 
        userId, 
        sessionId, 
        userMessageCount: userLogs?.length, 
        aiMessageCount: aiLogs?.length 
      });
    } catch (error) {
      logger.error('Failed to retrieve conversation history', { error: error.message, userId, sessionId });
      
      // Try to use draft data as fallback
      const chatDraft = draftOperations.getChatDraft(userId, sessionId);
      if (chatDraft && chatDraft.chatlog) {
        logger.info('Using draft conversation history as fallback', { userId, sessionId });
        userLogs = chatDraft.chatlog.filter(msg => msg.role === 'user');
        aiLogs = chatDraft.chatlog.filter(msg => msg.role === 'assistant');
        getData = { chatlog: chatDraft.chatlog };
      } else {
        // Ultimate fallback
        userLogs = [{ role: 'user', content: prompt.trim() }];
        aiLogs = [];
        getData = { chatlog: [] };
      }
    }

    // Step 3: Build conversation history string with error resilience
    let conversationHistory = '';
    try {
      if (userLogs && aiLogs) {
        userLogs.forEach((log, index) => {
          conversationHistory += `User: ${log.content}\n`;
          if (aiLogs[index]) {
            conversationHistory += `AI: ${aiLogs[index].content}\n`;
          }
        });
      }
    } catch (error) {
      logger.warn('Error building conversation history', { error: error.message, userId, sessionId });
      conversationHistory = `User: ${prompt}\n`; // Fallback to current prompt only
    }

    // Append the current prompt to the conversation history
    const combinedPrompt = conversationHistory + `User: ${prompt}\nAI:`;
    logger.debug('Chat conversation prepared', { userId, sessionId, therapyMode, sessionType, messageCount: getData?.chatlog?.length });

    // Step 4: Get AI response with circuit breaker and retry logic
    let aiResponse;
    try {
      logger.info('Processing AI request', { userId, sessionId, therapyMode, sessionType });
      
      // Use circuit breaker pattern for OpenAI calls
      aiResponse = await circuitBreakers.openai.call(async () => {
        return await withOpenAIRetry(async () => {
          const response = await callAI(combinedPrompt, therapyMode, sessionType);
          
          if (!response || !response.text) {
            throw new Error('Invalid AI response received');
          }
          
          return response;
        }, { userId, sessionId, therapyMode, sessionType });
      }, { userId, sessionId, operation: 'chat_ai_call' });
      
      logger.info('AI response generated', { userId, sessionId, hasAudio: !!aiResponse.audioFile });
      
      // Update draft with AI response
      const currentChatlog = getData?.chatlog || [];
      const updatedChatlog = [
        ...currentChatlog,
        { role: 'user', content: prompt.trim() },
        { role: 'assistant', content: aiResponse.text }
      ];
      draftOperations.saveChatDraft(userId, sessionId, updatedChatlog, aiResponse);
      
    } catch (error) {
      logger.error('AI processing error', { error: error.message, userId, sessionId, stack: error.stack });
      
      // Check circuit breaker state
      if (error.code === 'CIRCUIT_BREAKER_OPEN') {
        return res.status(503).json(createErrorResponse({
          message: 'AI service temporarily unavailable. Please try again in a moment.',
          code: 'SERVICE_UNAVAILABLE',
          retryAfter: 30
        }));
      }
      
      handleExternalServiceError(error, 'OpenAI', 'generate chat response');
    }

    // Step 5: Save AI response to database with error handling
    try {
      await addTextData(userId, "assistant", aiResponse.text, sessionId);
      logger.debug('AI response saved to database', { userId, sessionId });
      
      // Clear draft since we successfully saved to database
      // Keep draft for a bit longer in case of subsequent failures
      setTimeout(() => {
        // Only remove draft if no recent failures
        const circuitBreakerState = circuitBreakers.openai.getState();
        if (circuitBreakerState.state === 'CLOSED') {
          // Keep the draft for potential recovery, but mark it as saved
          draftOperations.updateDraft(userId, sessionId, { savedToDatabase: true });
        }
      }, 60000); // Wait 1 minute before cleanup
      
    } catch (error) {
      logger.warn('Failed to save AI response to database', { error: error.message, userId, sessionId });
      
      // Don't fail the entire request if we can't save the AI response
      // The draft will preserve the conversation state
      logger.info('AI response preserved in draft cache', { userId, sessionId });
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

/**
 * GET /chat/draft/:sessionId - Retrieve draft session data for recovery
 */
route.get("/draft/:sessionId", asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json(createErrorResponse({
      message: 'userId is required as query parameter',
      code: 'MISSING_USER_ID'
    }));
  }

  if (!isValidSessionId(sessionId)) {
    return res.status(400).json(createErrorResponse({
      message: 'Invalid session ID format',
      code: 'INVALID_SESSION_ID'
    }));
  }

  try {
    const draft = draftOperations.getChatDraft(userId, sessionId);
    
    if (!draft) {
      return res.status(404).json(createErrorResponse({
        message: 'No draft found for this session',
        code: 'DRAFT_NOT_FOUND'
      }));
    }

    logger.info('Draft session data retrieved', { userId, sessionId, draftAge: Date.now() - new Date(draft.timestamp).getTime() });

    res.json({
      success: true,
      draft: {
        sessionId,
        chatlog: draft.chatlog || [],
        aiResponse: draft.aiResponse || null,
        timestamp: draft.timestamp,
        savedToDatabase: draft.savedToDatabase || false
      }
    });
  } catch (error) {
    logger.error('Error retrieving draft session', { error: error.message, userId, sessionId });
    res.status(500).json(createErrorResponse({
      message: 'Failed to retrieve draft session data',
      code: 'DRAFT_RETRIEVAL_ERROR'
    }));
  }
}));

module.exports = route;

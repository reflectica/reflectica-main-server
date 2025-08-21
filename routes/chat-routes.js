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

route.post("/", asyncHandler(async (req, res) => {
  validateRequiredFields(['prompt', 'userId', 'sessionId', 'therapyMode', 'sessionType'], req.body);
  
  let { prompt, userId, sessionId, therapyMode, sessionType } = req.body;

  // Validate and sanitize inputs
  prompt = validateAndSanitizePrompt(prompt);
  userId = validateUserId(userId);
  therapyMode = validateTherapyMode(therapyMode);
  sessionType = validateSessionType(sessionType);

  // Validate session ID format
  if (!isValidSessionId(sessionId)) {
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
    console.log("Chat request processed for user session");
    console.log("therapy type:", sessionType);
    console.log("therapy mode:", therapyMode);

    // Step 4: Get AI response with comprehensive error handling
    let aiResponse;
    try {
      aiResponse = await callAI(combinedPrompt, therapyMode, sessionType);
      
      if (!aiResponse || !aiResponse.text) {
        throw new Error('Invalid AI response received');
      }
      
      console.log("AI response generated successfully");
    } catch (error) {
      console.error('AI processing error:', error);
      handleExternalServiceError(error, 'OpenAI', 'generate chat response');
    }

    // Step 5: Log AI's response with error handling
    try {
      await addTextData(userId, "assistant", aiResponse.text, sessionId);
    } catch (error) {
      console.warn('Failed to save AI response:', error);
      // Don't fail the entire request if we can't save the AI response
    }

    // Step 6: Handle audio response
    let audioResponse = null;
    if (aiResponse.audioFile) {
      try {
        // Validate audio file exists and is accessible
        audioResponse = aiResponse.audioFile;
      } catch (error) {
        console.warn('Audio processing error:', error);
        // Continue without audio if there's an issue
      }
    }

    console.log("Chat session completed successfully");

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
    console.error('Chat processing error:', error);
    throw error; // Will be caught by asyncHandler and sent to global error handler
  }
}));

module.exports = route;

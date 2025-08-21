// routes/chatRoutes.js

const route = require('express').Router();
const { callAI, openai } = require('../config/openAi');
const { addTextData, getTexts, getTextsSeperated } = require('../controllers/text-controllers');
const { searchDocs } = require('../config/pinecone');

route.post("/", async (req, res) => {
  try {
    const { prompt, userId, sessionId, therapyMode, sessionType } = req.body;

    // Input validation
    if (!therapyMode) {
      return res.status(400).json({ 
        error: 'Missing therapyMode parameter.',
        message: 'Please specify a therapy mode to continue your session.' 
      });
    }

    if (!prompt || !userId || !sessionId) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        message: 'Please provide all required information: prompt, user ID, and session ID.' 
      });
    }

    // Log user message with error handling
    try {
      await addTextData(userId, "user", prompt, sessionId);
    } catch (error) {
      console.error('Error saving user message:', error);
      // Continue execution - this is logged but not critical for the response
    }

    // Retrieve conversation history with error handling
    let getData, userLogs, aiLogs;
    try {
      getData = await getTexts(userId, sessionId);
      const separatedData = await getTextsSeperated(userId, sessionId);
      userLogs = separatedData.userLogs || [];
      aiLogs = separatedData.aiLogs || [];
    } catch (error) {
      console.error('Error retrieving conversation history:', error);
      // Fallback to empty arrays if we can't get history
      getData = { chatlog: [] };
      userLogs = [];
      aiLogs = [];
    }

    // Build conversation history string
    let conversationHistory = '';
    try {
      userLogs.forEach((log, index) => {
        conversationHistory += `User: ${log.content}\n`;
        if (aiLogs[index]) {
          conversationHistory += `AI: ${aiLogs[index].content}\n`;
        }
      });
    } catch (error) {
      console.error('Error building conversation history:', error);
      conversationHistory = ''; // Fallback to empty history
    }

    // Append the current prompt to the conversation history
    const combinedPrompt = conversationHistory + `User: ${prompt}\nAI:`;
    console.log("Combined Prompt:", combinedPrompt);

    let textResponse, audioFilePath;
    console.log(getData);
    
    try {
      // Pass combinedPrompt and therapyMode to callAI
      console.log("therapy type:", sessionType )
      console.log("therapy mode:", therapyMode)
      
      const aiResponse = await callAI(combinedPrompt, therapyMode, sessionType);
      textResponse = aiResponse?.text;
      audioFilePath = aiResponse?.audioFile;
      
      if (!audioFilePath) {
        console.warn('No audio file returned from AI service');
        return res.status(503).json({ 
          error: 'AI service unavailable',
          message: 'The AI therapy service is temporarily unavailable. Please try again in a moment.' 
        });
      }
      
      console.log("AI Response:", textResponse);

      // Log AI's response with error handling
      try {
        if (textResponse) {
          await addTextData(userId, "assistant", textResponse, sessionId);
        }
      } catch (error) {
        console.error('Error saving AI response:', error);
        // Continue execution - this is logged but not critical for the response
      }

      res.send({ audio: audioFilePath });

    } catch (aiError) {
      console.error('AI service error:', aiError);
      
      // Check if it's a network/connection error
      if (aiError.code === 'ENOTFOUND' || aiError.code === 'ECONNREFUSED' || aiError.code === 'ETIMEDOUT') {
        return res.status(503).json({ 
          error: 'Network connection failed',
          message: 'Unable to connect to the AI service. Please check your internet connection and try again.' 
        });
      }
      
      // Check if it's an API rate limit or authentication error
      if (aiError.status === 429) {
        return res.status(429).json({ 
          error: 'Service temporarily unavailable',
          message: 'The AI service is experiencing high demand. Please wait a moment and try again.' 
        });
      }
      
      if (aiError.status === 401 || aiError.status === 403) {
        console.error('AI service authentication error:', aiError);
        return res.status(503).json({ 
          error: 'Service configuration error',
          message: 'There is a temporary issue with the therapy service. Please try again later or contact support.' 
        });
      }
      
      // Generic AI service error
      return res.status(500).json({ 
        error: 'AI processing failed',
        message: 'We encountered an issue processing your message. Please try rephrasing your message or try again later.' 
      });
    }

    console.log(getData);

  } catch (error) {
    console.error('Unexpected error in chat route:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'An unexpected error occurred during your therapy session. Please try again or contact support if the issue persists.' 
    });
  }
});

module.exports = route;

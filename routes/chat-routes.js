// routes/chatRoutes.js

const route = require('express').Router();
const { callAI, openai } = require('../config/openAi');
const { addTextData, getTexts, getTextsSeperated } = require('../controllers/text-controllers');
const { searchDocs } = require('../config/pinecone');

route.post("/", async (req, res) => {
  const { prompt, userId, sessionId, therapyMode, sessionType } = req.body; // Extract therapyMode

  if (!therapyMode) {
    return res.status(400).json({ error: 'Missing therapyMode parameter.' });
  }

  if (!prompt || !userId || !sessionId) {
    return res.status(400).json({ 
      error: 'Missing required parameters', 
      message: 'Please provide prompt, user ID, and session ID to continue the conversation.' 
    });
  }

  try {
    // Log user message with error handling
    try {
      await addTextData(userId, "user", prompt, sessionId);
    } catch (error) {
      console.error('Error saving user message:', error);
      return res.status(500).json({ 
        error: 'Unable to save message', 
        message: 'There was an issue saving your message. Please try again.' 
      });
    }

    // Retrieve conversation history with error handling
    let getData, userLogs, aiLogs;
    try {
      getData = await getTexts(userId, sessionId);
      const separatedLogs = await getTextsSeperated(userId, sessionId);
      userLogs = separatedLogs.userLogs;
      aiLogs = separatedLogs.aiLogs;
    } catch (error) {
      console.error('Error retrieving conversation history:', error);
      return res.status(500).json({ 
        error: 'Unable to retrieve conversation history', 
        message: 'There was an issue retrieving your conversation history. Please try again.' 
      });
    }

    // Build conversation history string
    let conversationHistory = '';
    userLogs.forEach((log, index) => {
      conversationHistory += `User: ${log.content}\n`;
      if (aiLogs[index]) {
        conversationHistory += `AI: ${aiLogs[index].content}\n`;
      }
    });

    // Append the current prompt to the conversation history
    const combinedPrompt = conversationHistory + `User: ${prompt}\nAI:`;
    console.log("Combined Prompt:", combinedPrompt);

    console.log(getData);
    
    // Call AI with error handling and retry logic
    try {
      console.log("therapy type:", sessionType )
      console.log("therapy mode:", therapyMode)
      
      const aiResponse = await callAI(combinedPrompt, therapyMode, sessionType);
      const textResponse = aiResponse.text;
      const audioFilePath = aiResponse.audioFile;    
      console.log("AI Response:", textResponse);

      // Log AI's response with error handling
      try {
        await addTextData(userId, "assistant", textResponse, sessionId);
      } catch (error) {
        console.error('Error saving AI response:', error);
        // Continue execution even if saving fails
      }

      res.status(200).json({ audio: audioFilePath });

    } catch (aiError) {
      console.error('AI service error:', aiError);
      
      // Determine error type and provide appropriate response
      if (aiError.message && aiError.message.includes('rate limit')) {
        return res.status(429).json({ 
          error: 'Service temporarily unavailable', 
          message: 'Our AI service is currently experiencing high demand. Please try again in a few moments.' 
        });
      } else if (aiError.message && aiError.message.includes('network')) {
        return res.status(503).json({ 
          error: 'Network error', 
          message: 'There was a network issue connecting to our AI service. Please check your connection and try again.' 
        });
      } else {
        return res.status(500).json({ 
          error: 'AI service error', 
          message: 'Our AI assistant is currently unavailable. Please try again later.' 
        });
      }
    }

    console.log(getData);

  } catch (error) {
    console.error('Unexpected error in chat route:', error);
    res.status(500).json({ 
      error: 'Server error', 
      message: 'An unexpected error occurred. Please try again later.' 
    });
  }
});

module.exports = route;

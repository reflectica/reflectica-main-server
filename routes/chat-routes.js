// routes/chatRoutes.js

const route = require('express').Router();
const { callAI, openai } = require('../config/openAi');
const { addTextData, getTexts, getTextsSeperated } = require('../controllers/text-controllers');
const { searchDocs } = require('../config/pinecone');
const logger = require('../utils/logger');

route.post("/", async (req, res) => {
  const { prompt, userId, sessionId, therapyMode, sessionType } = req.body; // Extract therapyMode

  if (!therapyMode) {
    logger.warn('Missing therapyMode parameter', { userId, sessionId });
    return res.status(400).json({ error: 'Missing therapyMode parameter.' });
  }

  try {
    // Log user message
    await addTextData(userId, "user", prompt, sessionId);

    // Retrieve conversation history
    const getData = await getTexts(userId, sessionId);
    const { userLogs, aiLogs } = await getTextsSeperated(userId, sessionId);

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
    logger.debug('Chat conversation prepared', { userId, sessionId, therapyMode, sessionType });

    let textResponse;
    logger.debug('Retrieved conversation data', { userId, sessionId, messageCount: getData?.length });
    try {
      // Pass combinedPrompt and therapyMode to callAI
      logger.info('Processing AI request', { userId, sessionId, therapyMode, sessionType });
      const aiResponse = await callAI(combinedPrompt, therapyMode, sessionType);
      const textResponse = aiResponse.text;
      const audioFilePath = aiResponse.audioFile;    
      logger.info('AI response generated', { userId, sessionId, hasAudio: !!audioFilePath });

      // Log AI's response
      await addTextData(userId, "assistant", textResponse, sessionId);

      res.send({ audio: audioFilePath });

    } catch (e) {
      logger.error('AI processing failed', { error: e.message, userId, sessionId, stack: e.stack });
      res.status(500).send(e);
    }

  } catch (e) {
    logger.error('Chat route error', { error: e.message, userId, sessionId, stack: e.stack });
    res.status(500).send(e);
  }
});

module.exports = route;

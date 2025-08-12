// routes/chatRoutes.js

const route = require('express').Router();
const { callAI, openai } = require('../config/openAi');
const { addTextData, getTexts, getTextsSeperated } = require('../controllers/text-controllers');
const { searchDocs } = require('../config/pinecone');
const { auditPHICreate } = require('../middleware/auditMiddleware');

route.post("/", auditPHICreate, async (req, res) => {
  const { prompt, userId, sessionId, therapyMode, sessionType } = req.body; // Extract therapyMode

  if (!therapyMode) {
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
    console.log("Combined Prompt:", combinedPrompt);

    let textResponse;
    console.log(getData);
    try {
      // Pass combinedPrompt and therapyMode to callAI
      console.log("therapy type:", sessionType )
      console.log("therapy mode:", therapyMode)
      const aiResponse = await callAI(combinedPrompt, therapyMode, sessionType);
      const textResponse = aiResponse.text;
      const audioFilePath = aiResponse.audioFile;    
      console.log("AI Response:", textResponse);

      // Log AI's response
      await addTextData(userId, "assistant", textResponse, sessionId);

      res.send({ audio: audioFilePath });

    } catch (e) {
      console.log(e);
      res.status(500).send(e);
    }

    console.log(getData);

  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
});

module.exports = route;

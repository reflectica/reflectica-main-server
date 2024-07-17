const route = require('express').Router()
const { polly } = require('../config/aws')
const { callAI, openai } = require('../config/openAi')
const { addTextData, getTexts, getTextsSeperated } = require('../controllers/text-controllers')
const {searchDocs} = require('../config/pinecone')


route.post("/", async (req, res) => {
  const { prompt, userId, sessionId } = req.body;
  await addTextData(userId, "user", prompt, sessionId);
  const getData = await getTexts(userId, sessionId);
  const { userLogs, aiLogs } = await getTextsSeperated(userId, sessionId);
  // Fetch matching texts based on the user's query and userId
  const matchingTexts = await searchDocs(userId, prompt);
  const matchingTextsString = matchingTexts.join(' '); 
  console.log("matchingtexts: ", matchingTextsString)
  let conversationHistory = '';
  userLogs.forEach((log, index) => {
    conversationHistory += `User: ${log.content}\n`;
    if (aiLogs[index]) {
      conversationHistory += `AI: ${aiLogs[index].content}\n`;
    }
  });

  // Append the current prompt to the conversation history
  const combinedPrompt = conversationHistory + `Additional Information: ${matchingTextsString}\n` + `User: ${prompt}\nAI:`;


  let textResponse;
  console.log(getData)
  try {
    textResponse = await callAI(combinedPrompt);
    console.log(textResponse);

    // Log the AI's response
    await addTextData(userId, "assistant", textResponse, sessionId);

        // OpenAI TTS API call
    const response = await openai.audio.speech.create({
        model: "tts-1",
        voice: "nova",
        input: textResponse
    });
    
    const audioStream = Buffer.from(await response.arrayBuffer());
    const audioStreamBase64 = audioStream.toString('base64');
    res.send({ audio: audioStreamBase64 });
    
  } catch (e) {
    console.log(e)
    res.status(500).send(e);
  }

  console.log(getData)

});
module.exports = route;
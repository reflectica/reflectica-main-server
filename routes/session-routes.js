const route = require('express').Router()
const { callOpenAi } = require('../config/openAi')
const { getAllUserSessions, getSentiment, userEmotions } = require('../controllers/user-controllers')
const { getTexts, getTextFromSummaryTable, deleteAllTexts } = require('../controllers/text-controllers')
const { registerSummary } = require('../controllers/summary-controller')
const { upsertChunksWithEmbeddings } = require('../config/pinecone')
const { createEmbeddings } = require('../config/openAi')
const { askForShortSummary, askForin5LongSummary, askForin3LongSummary, askForUserProfile, askForDSMScores} = require('../utils/text')
const { moodTable } = require('../utils/mood')

route.post("/getAllSessions", async (req, res) => {
  const { userId } = req.body;
  const getAllSessionsForUser = await getAllUserSessions(userId);
  res.send({ sessions: getAllSessionsForUser })
})

route.post("/getSessionTranscripts", async (req, res) => {
  const { sessionId, userId } = req.body;
  const getAllTranscriptsForSessions = await getTextFromSummaryTable(userId, sessionId)
  res.send(getAllTranscriptsForSessions)
})

route.post("/endSession", async (req, res) => {
  const { userId, sessionId } = req.body;
  const getData = await getTexts(userId, sessionId)
  console.log(getData, "hhh")
  const userMessages = getData.chatlog
  .filter(entry => entry.role === 'user')
  .map(entry => entry.content)
  .join(' ');
  const queryData = { "inputs": userMessages };
  const queryEmotions = { "text": userMessages };

  const shortSummaryQuestion = getData.chatlog.concat(askForShortSummary)
  const userDocumentQuestion = getData.chatlog.concat(askForUserProfile)
  const dsmScoreQuestion = getData.chatlog.concat(askForDSMScores)
  let longSummaryQuestion;
  if (getData.chatlog.length >= 10) {
    longSummaryQuestion = getData.chatlog.concat(askForin5LongSummary)

  } else {
    longSummaryQuestion = getData.chatlog.concat(askForin3LongSummary)
  }

  const analyzeUser = await getSentiment(userId, sessionId)
  const shortSummary = await callOpenAi(shortSummaryQuestion);
  const dsmScore = await callOpenAi(dsmScoreQuestion);
  const userDocument = await callOpenAi(userDocumentQuestion);
  const longSummary = await callOpenAi(longSummaryQuestion);
  const emotions = await userEmotions(queryEmotions);

  console.log(userMessages)
  console.log(emotions)
  console.log(userDocument, "user doc")
  console.log(shortSummary, "dsagadsgadgads")
  console.log(longSummary, "asdgandgoasdgoagadsg")

  const userMoodPercentage = moodTable[`${analyzeUser}`]
  const embeddings = await createEmbeddings(userDocument);
  await upsertChunksWithEmbeddings(userId, embeddings)
  await registerSummary(userDocument, shortSummary, longSummary, userMoodPercentage, sessionId, userId, getData.chatlog)
  await deleteAllTexts(userId, sessionId)

  console.log({ chatlog: getData.chatlog, shortSummary: shortSummary, dsmScore: dsmScore, longSummary: longSummary, sessionId: sessionId, mood: userMoodPercentage })
  res.send({ chatlog: getData.chatlog, shortSummary: shortSummary, longSummary: longSummary, sessionId: sessionId, mood: userMoodPercentage })
})
module.exports = route;
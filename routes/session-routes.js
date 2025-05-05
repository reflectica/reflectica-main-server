const route = require('express').Router()
const { callOpenAi } = require('../config/openAi')
const { getAllUserSessions, getSentiment, userEmotions, parseScores, calculateMentalHealthScore, normalizeScores } = require('../controllers/user-controllers')
const { getTexts, getTextFromSummaryTable, deleteAllTexts } = require('../controllers/text-controllers')
const { registerSummary } = require('../controllers/summary-controller')
const { upsertChunksWithEmbeddings } = require('../config/pinecone')
const { createEmbeddings } = require('../config/openAi')
const { askForShortSummary, askForin5LongSummary, askForin3LongSummary, askForUserProfile, askForDSMScores, askForDSMScoresSpanish, englishToSpanish } = require('../utils/text')
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
  const { userId, sessionId, language, sessionType } = req.body; // Include 'language' from the request body
  const getData = await getTexts(userId, sessionId);

  const userMessages = getData.chatlog
    .filter(entry => entry.role === 'user')
    .map(entry => entry.content)
    .join(' ');

  const spanishTranscipt = getData.chatlog.concat(englishToSpanish);
  const englishTranscript = await callOpenAi(spanishTranscipt);
  const queryData = { "inputs": userMessages };
  const queryEmotions = { "text": userMessages };
  console.log("queryemotions", queryEmotions)
  const querySpanish = {"text": englishTranscript}

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

  const analyzeUser = await getSentiment(userId, sessionId);
  const shortSummary = await callOpenAi(shortSummaryQuestion);
  const dsmScore = await callOpenAi(dsmScoreQuestion); // Get DSM scores
  const userDocument = await callOpenAi(userDocumentQuestion);
  const longSummary = await callOpenAi(longSummaryQuestion);

  // Conditionally handle emotions based on language
  let emotions;
  if (language === 'es-ES') {
    emotions = await userEmotions(JSON.stringify(querySpanish));
  } else {
    emotions = await userEmotions(JSON.stringify(queryEmotions));
  }

  const parsedScores = parseScores(dsmScore);
  const normalizedScores = normalizeScores(parsedScores);
  const mentalHealthScore = calculateMentalHealthScore(normalizedScores).toFixed(2);

  // Create the referral prompt by combining DSM scores and user messages
  const referralPrompt = [
    {
      role: "system",
      content: `You are a mental health referral bot. Analyze the following DSM scores and patient transcript to recommend a specialized therapy. Choose from the following areas: 
      
      1. Depression/Anxiety
      2. Trauma and PTSD
      3. Family and Relationship Issues
      4. Substance Abuse/Addiction
      5. Grief and Loss

      DSM Scores: ${JSON.stringify(parsedScores)}

      Transcript: ${userMessages}

      Respond in this format:

      Recommended Specialization: [Specialization]
      Reason: [Explanation based on DSM scores and transcript]`
    }
  ];


  // Call OpenAI with the combined prompt to get the referral recommendation
  let referralRecommendation;
  if (sessionType === 'diagnostic'){
    referralRecommendation = await callOpenAi(referralPrompt);
  } else {
    referralRecommendation = ''
  }

  // Log results for debugging
  console.log("Referral Recommendation:", referralRecommendation);

  const userMoodPercentage = moodTable[`${analyzeUser}`];
  const embeddings = await createEmbeddings(userDocument);
  await upsertChunksWithEmbeddings(userId, embeddings);
  await registerSummary(userDocument, shortSummary, longSummary, emotions, normalizedScores, mentalHealthScore, referralRecommendation, sessionId, userId, getData.chatlog);
  await deleteAllTexts(userId, sessionId);

  console.log({
    chatlog: getData.chatlog,
    shortSummary: shortSummary,
    dsmScore: dsmScore,
    longSummary: longSummary,
    sessionId: sessionId,
    mood: userMoodPercentage,
    referral: referralRecommendation,
  });

  // Send response including referral recommendation
  res.send({
    chatlog: getData.chatlog,
    shortSummary: shortSummary,
    longSummary: longSummary,
    sessionId: sessionId,
    mood: userMoodPercentage,
    emotions: emotions,
    normalizedScores: normalizedScores,
    mentalHealthScore: mentalHealthScore,
    referral: referralRecommendation, // Include referral recommendation in the response
  });
});

module.exports = route;
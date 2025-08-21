const route = require('express').Router()
const { callOpenAi } = require('../config/openAi')
const { getAllUserSessions, getSentiment, userEmotions, parseScores, calculateMentalHealthScore, normalizeScores } = require('../controllers/user-controllers')
const { getTexts, getTextFromSummaryTable, deleteAllTexts } = require('../controllers/text-controllers')
const { registerSummary } = require('../controllers/summary-controller')
const { upsertChunksWithEmbeddings } = require('../config/pinecone')
const { createEmbeddings } = require('../config/openAi')
const { askForShortSummary, askForin5LongSummary, askForin3LongSummary, askForUserProfile, askForDSMScores, askForDSMScoresSpanish, englishToSpanish } = require('../utils/text')
const { moodTable } = require('../utils/mood')
const logger = require('../utils/logger')

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

  const fullSessionTranscript = getData.chatlog
    .map(entry => `[${entry.role}] ${entry.content}`)
    .join('\n');

  let cleanedText = userMessages.replace(/\n/g, ' ');
  const spanishTranscipt = getData.chatlog.concat(englishToSpanish);
  const englishTranscript = await callOpenAi(spanishTranscipt);
  const queryData = { "inputs": userMessages };
  const queryEmotions = { "text": userMessages };
  logger.debug('Processing session emotions', { userId, sessionId, language })
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
    emotions = await userEmotions(JSON.stringify({ text: cleanedText }));
    
  }

  const rawScores = parseScores(dsmScore);
  const normalizedScores = normalizeScores(rawScores);
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

      DSM Scores: ${JSON.stringify(rawScores)}

      Transcript: ${userMessages}

      At the end of your response, include the entire session transcript.

      Respond in this format:
      
      Recommended Specialization: [Specialization]
      Reason: [Explanation based on DSM scores and transcript]
      Summary for Clinicians: [Concise summary of the patient's current situation]
      Severity Assessment (1-5): [Number indicating current severity level, 5 = most critical]
      Priority Ranking (1-5): [Number indicating how urgently care is needed, 5 = most urgent]

      Full Session Transcript: [The entire session transcript here, exactly as provided below.]

      =====

      Full Session Transcript to Include:
      ${fullSessionTranscript}
      `
    }
  ];



  // Call OpenAI with the combined prompt to get the referral recommendation

  referralRecommendation = await callOpenAi(referralPrompt);


  // Log results for debugging
  console.log("Referral Recommendation:", referralRecommendation);

  const userMoodPercentage = moodTable[`${analyzeUser}`];
  //const embeddings = await createEmbeddings(userDocument);
  //await upsertChunksWithEmbeddings(userId, embeddings);
  await registerSummary(userDocument, shortSummary, longSummary, emotions, normalizedScores, rawScores, mentalHealthScore, referralRecommendation, sessionId, userId, getData.chatlog);
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
    rawScores: rawScores,
    normalizedScores: normalizedScores,
    mentalHealthScore: mentalHealthScore,
    referral: referralRecommendation, // Include referral recommendation in the response
  });
});

module.exports = route;
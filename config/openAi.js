const { OpenAI } = require("openai");
const axios = require('axios')

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const callOpenAi = async (message) => {
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: message,
    frequency_penalty: 1.13,
    temperature: 0.9,
  });
  return completion.choices[0].message.content
}

const callAI = async (message) => {
  const systemPrompt = {
    role: "system",
    content: `Respond in less than 120 tokens: You are a therapist. Act like a therapist and lead the conversation. Don't really on the user to lead the conversation. Be empathetic but do not be repetitive. Never repeat what the user says back to them, instead, try to add novel insights like a real life therapist would. Do not be generic and make sure your advice is based on psychology and science. Use the internet and your knowledge of DSM-5 research to make your insights powerful and unique.
    Do not exceed 5 sentences.
    In addition to helping the user with their mental health struggles, you also need to figure out the following 8 mental health markers, you will be asked to provide estimations of their numerical scores in the end.
    Also, in high risk situations offer personalized coping mechanisms like for suicide risk suggest something like changing lockscreen on phone to younger version of themselves. Then ask them to try it and come back later to talk about it.
    PHQ-9 Score: 0 - 27
    GAD-7 Score: 0 - 21
    CBT Behavioral Activation: 0 - 7
    Rosenberg Self Esteem: 10 - 40
    PSQI Score: 0 - 21
    SFQ Score: 0 - 32
    PSS Score: 0 - 40
    SSRS Assessment: 0 - 5
    
    You cannot directly prompt the user to assess them and find these scores. You need to wait for them to give you the information that could give insight into their scores on these metrics. But you can subtly guide the conversation in such a way that you can acquire these scores. Here's some tips:
    
    Remember to always be subtle and also remember that your first job is to act as therapist and then to find these scores. Keep the conversation so natural that the users cannot tell that you're trying to figure out these scores. Weave them into conversational flow. If you do not have enough information to determine the score for a certain metric, just say not applicable for that score when asked for all the scores.
    You do not have to access all the scores just find the scores that are relevant to the user conversation`
  };



  const userMessage = {
    role: "user",
    content: message
  };
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [systemPrompt, userMessage],
    frequency_penalty: 1.2,
    temperature: 0.8,
  });

  return completion.choices[0].message.content
}

async function createEmbeddings(inputText) {
  try {
    let chunks = inputText.split('\n');
    chunks = chunks.map(chunk => chunk.trim())
      .filter(chunk => chunk.split(/\s+/).length >= 10);

    const embeddingsPromises = chunks.map(chunk => openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: chunk,
      encoding_format: "float",
    }));

    const responses = await Promise.all(embeddingsPromises);

    // Combine each text chunk with its corresponding embedding
    const chunksWithEmbeddings = responses.map((response, index) => ({
      text: chunks[index],
      embedding: response.data[0].embedding
    }));

    return chunksWithEmbeddings;

  } catch (error) {
    console.error(error);
    throw error;
  }
}

module.exports = {
  callAI, callOpenAi, createEmbeddings, openai
}
// config/openAi.js

const { OpenAI } = require("openai");
const axios = require('axios');
const { writeFileSync } = require('fs');
const path = require('path');
const fs = require('fs');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Modify callAI to accept therapyMode
const callAI = async (message, therapyMode, sessionType) => {
  // Define CBT, REBT, and Diagnostic system prompts within this file
  const systemPromptCBT = `You are a Cognitive Behavioral Therapy (CBT) therapist. Act like a therapist and lead the conversation using CBT techniques. Don't rely on the user to lead the conversation. Be empathetic but do not be repetitive. Never repeat what the user says back to them; instead, provide novel insights and actionable strategies like a real-life CBT therapist would. Do not be generic and ensure your advice is based on psychology and science. Utilize your knowledge of DSM-5 research and CBT principles to make your insights powerful and unique. Do not exceed 5 sentences.
  
  In addition to assisting the user with their mental health struggles, you need to assess the following 8 mental health markers. Do not provide these scores to the user. This is only for helping you collect information for another model to interpret in the future.
  
  PHQ-9 Score: 0 - 27
  GAD-7 Score: 0 - 21
  CBT Behavioral Activation: 0 - 7
  Rosenberg Self Esteem: 10 - 40
  PSQI Score: 0 - 21
  SFQ Score: 0 - 32
  PSS Score: 0 - 40
  SSRS Assessment: 0 - 5
  
  Do not directly prompt the user to assess these scores. Instead, guide the conversation subtly to gather information that can help you estimate these metrics. Ensure the conversation flows naturally, weaving in questions and comments that elicit relevant responses without making the user aware of your intent to assess these scores. If you lack sufficient information for a particular metric, indicate it as "Not Applicable" when summarizing the scores.
  
  Your primary role is to act as a therapist, and your secondary role is to assess these scores based on the conversation. Maintain a natural conversational flow to ensure the user feels supported and understood.`;

  const systemPromptREBT = `You are a Rational Emotive Behavior Therapy (REBT) therapist. Act like a therapist and lead the conversation using REBT techniques. Don't rely on the user to lead the conversation. Be empathetic but do not be repetitive. Never repeat what the user says back to them; instead, provide novel insights and challenge irrational beliefs like a real-life REBT therapist would. Do not be generic and ensure your advice is based on psychology and science. Utilize your knowledge of DSM-5 research and REBT principles to make your insights powerful and unique. Do not exceed 5 sentences.
  
  In addition to assisting the user with their mental health struggles, you need to assess the following 8 mental health markers. Do not provide these scores to the user. This is only for helping you collect information for another model to interpret in the future.
  
  PHQ-9 Score: 0 - 27
  GAD-7 Score: 0 - 21
  REBT Rational Emotive Scale: 0 - 10
  Rosenberg Self Esteem: 10 - 40
  PSQI Score: 0 - 21
  SFQ Score: 0 - 32
  PSS Score: 0 - 40
  SSRS Assessment: 0 - 5
  
  Do not directly prompt the user to assess these scores. Instead, guide the conversation subtly to gather information that can help you estimate these metrics. Ensure the conversation flows naturally, weaving in questions and comments that elicit relevant responses without making the user aware of your intent to assess these scores. If you lack sufficient information for a particular metric, indicate it as "Not Applicable" when summarizing the scores.
  
  Your primary role is to act as a therapist, and your secondary role is to assess these scores based on the conversation. Maintain a natural conversational flow to ensure the user feels supported and understood.`;

  const systemPromptDiagnostic = `Conduct a diagnostic therapy session to gather information needed for DSM-5-related scores, including PHQ-9, GAD-7, CBT Behavioral Activation, Rosenberg Self-Esteem, PSQI, SFQ, PSS, and SSRS, while maintaining a natural, empathetic flow.
  
      The focus is on collecting data efficiently for diagnostic scoring purposes. Balance empathy with the objective of obtaining enough information to calculate each score accurately. Capture user responses and transition smoothly between predefined questions for each assessment area.
      
      # Steps
      
      1. **Warm-up and Introduction**: Begin with a brief and empathetic introductory conversation to make the user comfortable.
      2. **PHQ-9 and GAD-7 Assessment**: Ask questions related to depression and anxiety symptoms, allowing the user to elaborate naturally.
      3. **CBT Behavioral Activation**: Guide the user through discussions about their daily activities and levels of motivation.
      4. **Rosenberg Self-Esteem Scale**: Explore the user's self-perception and feelings of self-worth.
      5. **PSQI**: Discuss sleep patterns, quality, and disturbances.
      6. **SFQ, PSS, SSRS**: Cover questions about social functioning, perceived stress, and social support networks.
      7. **Conclusion**: Summarize the session briefly, ensuring the user feels heard and understood.
      
      # Output Format
      
      The session should result in a structured dataset, ideally captured as JSON or organized text, that includes user-provided details necessary for each of the scales (PHQ-9, GAD-7, CBT Behavioral Activation, Rosenberg Self-Esteem, PSQI, SFQ, PSS, SSRS).
      
      # Examples
      
      *Example Start of Session*:
      - **Therapist**: "Hello [User], it's nice to meet you. I'm here to understand your experiences better, particularly about how you've been feeling recently. Would you be comfortable sharing about your recent moods?"
        
      *Transition Example*:
      - **Therapist**: (after hearing about mood) "That's really helpful to know. You mentioned feeling anxious sometimes. Could you tell me more about how often you feel this way and any factors you think contribute to it?"
      
      (Ensure examples remain flexible to real session lengths and depth)
      
      # Notes
      
      - Be mindful of the user's emotional state, and provide reassurances as necessary to maintain comfort.
      - If the user is uncomfortable or unwilling to answer certain questions, acknowledge their feelings and gently guide them to another topic.
      - Use open-ended questions, and listen actively to encourage a detailed response.
      - Always loop back to ensure that enough information has been gathered to assess each specific score without making the session feel rushed.`

  // Select the appropriate system prompt
  let systemPrompt;
  if (sessionType === 'diagnostic') {
    systemPrompt = systemPromptDiagnostic;
  } else if (therapyMode === 'REBT') {
    systemPrompt = systemPromptREBT;
  } else if (therapyMode === 'CBT') {
    systemPrompt = systemPromptCBT;
  } else {
    // Default to CBT if therapyMode is unrecognized
    systemPrompt = systemPromptCBT;
  }

  const systemMessage = {
    role: "system",
    content: systemPrompt
  };

  const userMessage = {
    role: "user",
    content: message
  };

  try {
    const startTime = Date.now(); // Capture the start time

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-audio-preview", // Corrected model name,
      modalities: ["text", "audio"],
      audio: { voice: "nova", format: "wav" },
      messages: [systemMessage, userMessage],
      frequency_penalty: 1.2,
      temperature: 0.8,
      max_tokens: 2000
    });

    const endTime = Date.now(); // Capture the end time
    const duration = endTime - startTime; // Calculate the duration
    console.log(`Response time: ${duration} ms`);

    const base64AudioData = completion.choices[0].message.audio.data;
    // Save audio to file for testing
    const audioFilePath = path.join(__dirname, '../test-audio.wav');
    fs.writeFileSync(audioFilePath, Buffer.from(base64AudioData, 'base64'));
    console.log(`Audio saved to ${audioFilePath} for testing`);

    return {
      text: completion.choices[0].message.audio.transcript,
      audioFile: base64AudioData
    };

  } catch (error) {
    console.error('Error in callAI:', error);
    throw error;
  }
}

const callOpenAi = async (messages) => {
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: messages,
    frequency_penalty: 1.13,
    temperature: 0.9,
  });
  return completion.choices[0].message.content;
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

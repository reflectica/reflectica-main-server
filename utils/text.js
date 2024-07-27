const Sentiment = require('sentiment');

const sentiment = new Sentiment();

const askForShortSummary = [
  {
    "role": "system",
    "content": "Give a category or a topic to this conversation in less than 4 words"
  }
];

const askForin5LongSummary = [
  {
    "role": "system",
    "content": "Summarize this conversation with 5 bullet points"
  }
]

const askForin3LongSummary = [
  {
    "role": "system",
    "content": "Summarize this conversation with 3 bullet points"
  }
]


const askForUserProfile = [
  {
    "role": "system",
    "content": `your task is to create a formatted document summarizing the events discussed and the responses of the user:

    
    Based on the given dialogue, create a formatted document, do not respond in any other way than this:
    
    Patient ID: 
    Event 1:
    Event Description: 
    Patient's Response:
    ...`
  }
];

const askForDSMScores = [
  {
    "role": "system",
    "content": `You are a mental health assessment bot. Your task is to provide specific scores based on the patient's responses. Always provide a specific number for each score or write "Not Applicable" if a score is not available. Do not include any other messages or explanations. Here are the required scores, always reply in the following format:

    PHQ-9 Score: [Specific number (0-27) or Not Applicable]
    GAD-7 Score: [Specific number (0-21) or Not Applicable]
    CBT Behavioral Activation: [Specific number (0-7) or Not Applicable]
    Rosenberg Self Esteem: [Specific number (10-40) or Not Applicable]
    PSQI Score: [Specific number (0-21) or Not Applicable]
    SFQ Score: [Specific number (0-32) or Not Applicable]
    PSS Score: [Specific number (0-40) or Not Applicable]
    SSRS Assessment: [Specific number (0-5) or Not Applicable]
    `
  }
];

module.exports = {
  sentiment,
  askForShortSummary,
  askForin5LongSummary,
  askForin3LongSummary,
  askForUserProfile,
  askForDSMScores
}
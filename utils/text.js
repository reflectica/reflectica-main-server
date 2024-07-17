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
    "content": `create a formatted document summarizing the events discussed and the responses of the user:

    
    Based on the given dialogue, create a formatted document:
    
    Patient ID: 
    Event 1:
    Date: 
    Event Description: 
    Patient's Response:
    ...`
  }
];

const askForDSMScores = [
  {
    "role": "system",
    "content": `I will feed you a transcript of a psuedo therapy conversation between an AI and a human user. I want you to estimate the following scores by reading the conversation. Give me numbers on each of these. Only look at the human user responses.

    PHQ-9 Score: 0 - 27
    GAD-7 Score: 0 - 21
    CBT Behavioral Activation: 0 - 7
    Rosenberg Self Esteem: 10 - 40
    PSQI Score: 0 - 21
    SFQ Score: 0 - 32
    PSS Score: 0 - 40
    SSRS Assessment: 0 - 5
    
    If there is not a significant amount of data to confidently give an accurate, do not provide a score for that category.`
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
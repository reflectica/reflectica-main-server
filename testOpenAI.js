const { callAI } = require('./config/openAi');
const player = require('play-sound')();

async function testCallAI() {
  const userMessage = { role: 'user', content: 'Is a golden retriever a good family dog?' };

  try {
    const response = await callAI(userMessage);
    console.log('AI Text Response:', response.text);

    // Check if the audio file exists and play it
    if (response.audioFile) {
      console.log('Playing audio file:', response.audioFile);
      player.play(response.audioFile, (err) => {
        if (err) {
          console.error('Error playing audio file:', err);
        } else {
          console.log('Audio playback finished.');
        }
      });
    } else {
      console.error('No audio file returned.');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testCallAI();
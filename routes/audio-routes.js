const route = require('express').Router();
const path = require('path');
const { addTextData } = require('../controllers/text-controllers');

route.get("/", async (req, res) => {
  try {
    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-realtime-preview",
        voice: "sage",
      }),
    });
    
    if (!r.ok) {
      const errorText = await r.text();
      console.error('OpenAI API error:', r.status, errorText);
      return res.status(500).json({ 
        error: 'Unable to create audio session', 
        message: 'There was an issue setting up the audio session. Please try again later.' 
      });
    }
    
    const data = await r.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error creating audio session:', error);
    res.status(500).json({ 
      error: 'Audio service unavailable', 
      message: 'The audio service is currently unavailable. Please try again later.' 
    });
  }
});
// In your backend audio routes
route.post('/openai-proxy', async (req, res) => {
  try {
    const { sdp, model, ephemeralKey } = req.body;
    
    console.log('🔄 Proxying SDP request to OpenAI Realtime API...');
    console.log('Model:', model);
    console.log('SDP length:', sdp?.length);
    
    const response = await fetch(`https://api.openai.com/v1/realtime?model=${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp',
      },
      body: sdp,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API returned ${response.status}: ${errorText}`);
    }
    
    const data = await response.text();
    console.log('✅ OpenAI proxy successful, response length:', data.length);
    
    res.status(200).send(data);
  } catch (error) {
    console.error('❌ OpenAI proxy error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

route.post("/transcript", async (req, res) => {
  try {
    const { userId, sessionId, role, message } = req.body;

    if (!userId || !sessionId || !role || !message) {
      return res.status(400).json({ 
        error: 'Missing required parameters', 
        message: 'User ID, session ID, role, and message are all required.' 
      });
    }

    // Log the incoming message with the specified role
    await addTextData(userId, role, message, sessionId);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving transcript:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Unable to save transcript', 
      message: 'There was an issue saving the transcript. Please try again.' 
    });
  }
});

module.exports = route;
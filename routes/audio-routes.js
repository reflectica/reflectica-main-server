const route = require('express').Router();
const path = require('path');
const { addTextData } = require('../controllers/text-controllers');
const { authenticateToken, authorizeUser } = require('../middleware/auth');

route.get("/", async (req, res) => {
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
  const data = await r.json();

  // Send back the JSON we received from the OpenAI REST API
  res.send(data);
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

route.post("/transcript", authenticateToken, authorizeUser, async (req, res) => {
  const { userId, sessionId, role, message } = req.body;

  try {
    // Log the incoming message with the specified role
    await addTextData(userId, role, message, sessionId);
    res.send({ success: true });
  } catch (e) {
    console.log(e);
    res.status(500).send({ success: false, error: e.message });
  }
});

module.exports = route;
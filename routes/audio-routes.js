const route = require('express').Router();
const path = require('path');
const { addTextData } = require('../controllers/text-controllers');

route.get("/", async (req, res) => {
  try {
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI realtime sessions API error:', response.status, errorText);
      
      if (response.status === 401) {
        return res.status(503).json({ 
          error: 'Service authentication error',
          message: 'Audio service is temporarily unavailable. Please try again later.' 
        });
      }
      
      if (response.status === 429) {
        return res.status(429).json({ 
          error: 'Service rate limit',
          message: 'Audio service is experiencing high demand. Please wait a moment and try again.' 
        });
      }
      
      return res.status(503).json({ 
        error: 'Audio service unavailable',
        message: 'The audio service is temporarily unavailable. Please try again later.' 
      });
    }

    const data = await response.json();
    res.send(data);
    
  } catch (error) {
    console.error('Error creating OpenAI realtime session:', error);
    
    // Check for network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return res.status(503).json({ 
        error: 'Network connection failed',
        message: 'Unable to connect to audio services. Please check your internet connection and try again.' 
      });
    }
    
    res.status(500).json({ 
      error: 'Audio session creation failed',
      message: 'Unable to start audio session. Please try again or use text chat instead.' 
    });
  }
});
// In your backend audio routes
route.post('/openai-proxy', async (req, res) => {
  try {
    const { sdp, model, ephemeralKey } = req.body;
    
    // Input validation
    if (!sdp || !model || !ephemeralKey) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        message: 'SDP, model, and ephemeral key are required for audio proxy.' 
      });
    }
    
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
      
      if (response.status === 401 || response.status === 403) {
        return res.status(401).json({ 
          error: 'Authentication failed',
          message: 'Audio session authentication failed. Please refresh and try again.' 
        });
      }
      
      if (response.status === 429) {
        return res.status(429).json({ 
          error: 'Rate limit exceeded',
          message: 'Too many audio requests. Please wait a moment and try again.' 
        });
      }
      
      return res.status(502).json({ 
        error: 'OpenAI API error',
        message: 'Audio service encountered an error. Please try again later.' 
      });
    }
    
    const data = await response.text();
    console.log('✅ OpenAI proxy successful, response length:', data.length);
    
    res.status(200).send(data);
    
  } catch (error) {
    console.error('❌ OpenAI proxy error:', error.message);
    
    // Check for network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return res.status(503).json({ 
        error: 'Network connection failed',
        message: 'Unable to connect to audio services. Please check your internet connection and try again.' 
      });
    }
    
    res.status(500).json({ 
      error: 'Audio proxy error',
      message: 'An error occurred while processing your audio request. Please try again.' 
    });
  }
});

route.post("/transcript", async (req, res) => {
  try {
    const { userId, sessionId, role, message } = req.body;

    // Input validation
    if (!userId || !sessionId || !role || !message) {
      return res.status(400).json({ 
        error: 'Missing required parameters',
        message: 'User ID, session ID, role, and message are required for transcript logging.' 
      });
    }

    // Validate role
    if (!['user', 'assistant'].includes(role)) {
      return res.status(400).json({ 
        error: 'Invalid role',
        message: 'Role must be either "user" or "assistant".' 
      });
    }

    // Log the incoming message with the specified role
    await addTextData(userId, role, message, sessionId);
    res.send({ success: true, message: 'Transcript logged successfully' });
    
  } catch (error) {
    console.error('Error logging transcript:', error);
    
    // Check for database connection errors
    if (error.code === 'ECONNREFUSED' || error.message.includes('database')) {
      return res.status(503).json({ 
        error: 'Database connection failed',
        message: 'Unable to save transcript. Your conversation may not be preserved. Please try again.' 
      });
    }
    
    res.status(500).json({ 
      error: 'Transcript logging failed',
      message: 'Unable to save your message. Please try again.' 
    });
  }
});

module.exports = route;
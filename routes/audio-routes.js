const route = require('express').Router();
const path = require('path');
const { addTextData } = require('../controllers/text-controllers');
const { 
  asyncHandler, 
  validateRequiredFields, 
  handleDatabaseError, 
  handleExternalServiceError,
  createErrorResponse,
  validateUserId,
  sanitizeString
} = require('../utils/errorHandler');

route.get("/", asyncHandler(async (req, res) => {
  // Validate environment variable
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json(createErrorResponse({
      message: 'OpenAI API configuration is missing',
      code: 'CONFIGURATION_ERROR'
    }));
  }

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
      throw new Error(`OpenAI API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    handleExternalServiceError(error, 'OpenAI Realtime', 'create session');
  }
}));
// In your backend audio routes
route.post('/openai-proxy', asyncHandler(async (req, res) => {
  validateRequiredFields(['sdp', 'model', 'ephemeralKey'], req.body);
  
  const { sdp, model, ephemeralKey } = req.body;
  
  // Validate inputs
  if (typeof sdp !== 'string' || sdp.length === 0) {
    return res.status(400).json(createErrorResponse({
      message: 'SDP must be a non-empty string',
      code: 'INVALID_SDP'
    }));
  }
  
  console.log('🔄 Proxying SDP request to OpenAI Realtime API...');
  console.log('Model:', model);
  console.log('SDP length:', sdp?.length);
  
  try {
    const response = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ephemeralKey}`,
        'Content-Type': 'application/sdp',
      },
      body: sdp,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenAI API error:', response.status);
      throw new Error(`OpenAI API returned ${response.status}`);
    }
    
    const data = await response.text();
    console.log('✅ OpenAI proxy successful, response length:', data.length);
    
    res.status(200).send(data);
  } catch (error) {
    console.error('❌ OpenAI proxy error - service unavailable');
    handleExternalServiceError(error, 'OpenAI Realtime', 'proxy SDP request');
  }
}));

route.post("/transcript", asyncHandler(async (req, res) => {
  validateRequiredFields(['userId', 'sessionId', 'role', 'message'], req.body);
  
  const userId = validateUserId(req.body.userId);
  const { sessionId, role, message } = req.body;

  // Validate role
  const validRoles = ['user', 'assistant', 'system'];
  if (!validRoles.includes(role)) {
    return res.status(400).json(createErrorResponse({
      message: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
      code: 'INVALID_ROLE',
      field: 'role'
    }));
  }

  // Validate and sanitize message content
  const sanitizedMessage = sanitizeString(message, 5000);
  if (sanitizedMessage.length === 0) {
    return res.status(400).json(createErrorResponse({
      message: 'Message must be a non-empty string',
      code: 'INVALID_MESSAGE',
      field: 'message'
    }));
  }

  try {
    // Log the incoming message with the specified role
    await addTextData(userId, role, sanitizedMessage, sessionId);
    
    res.json({ 
      success: true,
      message: 'Transcript saved successfully' 
    });
  } catch (error) {
    handleDatabaseError(error, 'save transcript');
  }
}));

module.exports = route;
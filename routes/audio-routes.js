const route = require('express').Router();
const path = require('path');
const { addTextData } = require('../controllers/text-controllers');

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

route.post("/transcript", async (req, res) => {
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
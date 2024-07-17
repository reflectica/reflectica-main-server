const route = require('express').Router()
const { registerEmailForLoopIntoDb, sendSupportMail } = require('../controllers/mail-controllers')

route.post("/sendSupportMail", async (req, res) => {
    const { firstName, lastName, email, phoneNumber, message} = req.body;
    await sendSupportMail(firstName, lastName, email, phoneNumber, message);
    res.send("email sent")
})
  
route.post("/subscribeToLoop", async (req, res) => {
    const { email } = req.body;
    await registerEmailForLoopIntoDb(email)
    res.send()
});

module.exports = route;
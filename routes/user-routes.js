const route = require('express').Router()
const { updateFieldInUserCollection, emailAllUserTranscripts, deleteAllUserSummaries } = require('../controllers/user-controllers')

route.post("/updateUserField", async (req, res) => {
    const { value, fieldName, userId } = req.body;
    await updateFieldInUserCollection(userId, value, fieldName)
    res.send()
})

route.post("/deleteEverythingForUser", async (req, res) => {
    const { userId } = req.body;
    await emailAllUserTranscripts(userId)
    await deleteAllUserSummaries(userId)
    res.send("finished")
})

module.exports = route;
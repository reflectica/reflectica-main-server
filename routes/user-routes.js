const route = require('express').Router()
const { updateFieldInUserCollection, emailAllUserTranscripts, deleteAllUserSummaries } = require('../controllers/user-controllers')
const { auditPHIUpdate, auditPHIDelete } = require('../middleware/auditMiddleware')

route.post("/updateUserField", auditPHIUpdate, async (req, res) => {
    const { value, fieldName, userId } = req.body;
    await updateFieldInUserCollection(userId, value, fieldName)
    res.send()
})

route.post("/deleteEverythingForUser", auditPHIDelete, async (req, res) => {
    const { userId } = req.body;
    await emailAllUserTranscripts(userId)
    await deleteAllUserSummaries(userId)
    res.send("finished")
})

module.exports = route;
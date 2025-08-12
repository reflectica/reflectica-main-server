const route = require('express').Router()
const { updateFieldInUserCollection, emailAllUserTranscripts, deleteAllUserSummaries } = require('../controllers/user-controllers')
const { authAndPHIWrite, authAndPHIDelete } = require('../middleware')

route.post("/updateUserField", authAndPHIWrite({ resource: 'user_field' }), async (req, res) => {
    const { value, fieldName, userId } = req.body;
    await updateFieldInUserCollection(userId, value, fieldName)
    res.send()
})

route.post("/deleteEverythingForUser", authAndPHIDelete({ resource: 'user_data' }), async (req, res) => {
    const { userId } = req.body;
    await emailAllUserTranscripts(userId)
    await deleteAllUserSummaries(userId)
    res.send("finished")
})

module.exports = route;
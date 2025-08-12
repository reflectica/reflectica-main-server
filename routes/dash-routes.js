const route = require('express').Router()
const { getDashboardData } = require('../controllers/dashboard-controllers')
const { auditPHIAccess } = require('../middleware/auditMiddleware')

route.post("/", auditPHIAccess, async (req, res) => {
    const { userId } = req.body
    const getAllDashboardData = await getDashboardData(userId)
    res.send(getAllDashboardData)
});

module.exports = route;
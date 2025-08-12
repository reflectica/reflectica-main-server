const route = require('express').Router()
const { getDashboardData } = require('../controllers/dashboard-controllers')
const { authAndPHIRead } = require('../middleware')

route.post("/", authAndPHIRead({ resource: 'dashboard_data' }), async (req, res) => {
    const { userId } = req.body
    const getAllDashboardData = await getDashboardData(userId)
    res.send(getAllDashboardData)
});

module.exports = route;
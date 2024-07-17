const route = require('express').Router()
const { getDashboardData } = require('../controllers/dashboard-controllers')

route.post("/", async (req, res) => {
    const { userId } = req.body
    const getAllDashboardData = await getDashboardData(userId)
    res.send(getAllDashboardData)
});

module.exports = route;
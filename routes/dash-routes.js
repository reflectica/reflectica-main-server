const route = require('express').Router()
const { getDashboardData } = require('../controllers/dashboard-controllers')
const { 
  asyncHandler, 
  validateRequiredFields, 
  handleDatabaseError 
} = require('../utils/errorHandler')

route.post("/", asyncHandler(async (req, res) => {
    validateRequiredFields(['userId'], req.body);
    
    const { userId } = req.body;

    try {
        const getAllDashboardData = await getDashboardData(userId);
        res.json({
            success: true,
            data: getAllDashboardData
        });
    } catch (error) {
        handleDatabaseError(error, 'retrieve dashboard data');
    }
}));

module.exports = route;
const route = require('express').Router()
const dashRoutes = require('./dash-routes')
const sessionRoutes = require('./session-routes')
const userRoutes = require('./user-routes')
const mailRoutes = require('./mail-routes')
const chatRoutes = require('./chat-routes')
const audioRoutes = require('./audio-routes')
const { createErrorResponse } = require('../utils/errorHandler')
const healthRoutes = require('./health-routes')

route.use('/dashboardData', dashRoutes)
route.use('/session', sessionRoutes)
route.use('/user', userRoutes)
route.use('/mail', mailRoutes)
route.use('/chat', chatRoutes)
route.use('/audio', audioRoutes)
route.use('/health', healthRoutes)

// Handle 404 errors for unknown routes
route.use('*', (req, res) => {
  res.status(404).json(createErrorResponse({
    message: `Route ${req.originalUrl} not found`,
    code: 'ROUTE_NOT_FOUND'
  }));
});

module.exports = route;
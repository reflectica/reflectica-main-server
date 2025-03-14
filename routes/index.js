const route = require('express').Router()
const dashRoutes = require('./dash-routes')
const sessionRoutes = require('./session-routes')
const userRoutes = require('./user-routes')
const mailRoutes = require('./mail-routes')
const chatRoutes = require('./chat-routes')
const audioRoutes = require('./audio-routes')


route.use('/dashboardData', dashRoutes)
route.use('/session', sessionRoutes)
route.use('/user', userRoutes)
route.use('/mail', mailRoutes)
route.use('/chat', chatRoutes)
route.use('/audio', audioRoutes)

module.exports = route;
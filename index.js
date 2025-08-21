const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser');
const routes = require('./routes')
const logger = require('./utils/logger')

const app = express()
const PORT = process.env.PORT || 3006;

app.use(bodyParser.json());
app.use(cors())
app.use(logger.requestLogger())
app.use('/', routes)
app.use(logger.errorLogger())

app.get('/', (req, res) => {
    res.send('Hello, this is your server!')
})
  
app.listen(PORT, () => {
    logger.info(`Server started on port ${PORT}`)
})
const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser');
const routes = require('./routes')
const { globalErrorHandler } = require('./utils/errorHandler')
const logger = require('./utils/logger')

const app = express()
const PORT = process.env.NODE_ENV === 'production' 
  ? process.env.PORT || 3006 
  : process.env.PORT || 3007;


app.use(bodyParser.json());
app.use(cors())
app.use(logger.requestLogger())
app.use('/', routes)
app.use(logger.errorLogger())

app.get('/', (req, res) => {
    res.send('Hello, this is your server!')
})

// Global error handling middleware (must be last)
app.use(globalErrorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});
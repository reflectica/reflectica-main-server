const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser');
const routes = require('./routes')

const app = express()
const PORT = process.env.PORT || 3006;

app.use(bodyParser.json());
app.use(cors())
app.use('/', routes)

app.get('/', (req, res) => {
    res.send('Hello, this is your server!')
})
  
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})
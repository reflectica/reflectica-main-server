// Configure TLS minimum version
const tls = require('tls');
tls.DEFAULT_MIN_VERSION = 'TLSv1.2';

const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser');
const routes = require('./routes')
const { enforceHTTPS, setHSTSHeaders } = require('./utils/security-middleware');

const app = express()
const PORT = process.env.PORT || 3006;

// Trust proxy if behind a load balancer
app.set('trust proxy', true);

// Security middleware - enforce HTTPS and set HSTS headers
app.use(enforceHTTPS);
app.use(setHSTSHeaders);

app.use(bodyParser.json());
app.use(cors())
app.use('/', routes)

app.get('/', (req, res) => {
    res.send('Hello, this is your server!')
})
  
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})

module.exports = app;
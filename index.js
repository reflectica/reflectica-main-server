const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser');
const routes = require('./routes')
const { globalErrorHandler } = require('./utils/errorHandler')
const logger = require('./utils/logger')

const app = express()
const PORT = process.env.PORT || 3006;

// Enhanced CORS configuration for different environments
const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production' 
  ? [
      'https://reflectica.ai',     // Production domain
      'capacitor://localhost',     // iOS production app
      'http://localhost'           // Android production app
    ]
  : [
      'http://localhost:3000',     // Web dev
      'http://localhost:3006',     // API dev
      'http://localhost:8081',     // Metro bundler
      'capacitor://localhost',     // iOS simulator
      'ionic://localhost'          // Ionic dev
    ];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    // Check against allowed origins
    const isAllowed = ALLOWED_ORIGINS.some(allowed => {
      if (allowed.includes('*')) {
        const regex = new RegExp(allowed.replace(/\*/g, '.*').replace(/\./g, '\\.'));
        return regex.test(origin);
      }
      return allowed === origin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

app.use(bodyParser.json());
app.use(cors(corsOptions))
app.use(logger.requestLogger())

// Health check endpoint (required for Cloud Run)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
})

app.use('/', routes)
app.use(logger.errorLogger())

app.get('/', (req, res) => {
    res.send('Hello, this is your Reflectica server!')
})

// Global error handling middleware (must be last)
app.use(globalErrorHandler);
  
app.listen(PORT, () => {
    logger.info(`Server started on port ${PORT}`)
})
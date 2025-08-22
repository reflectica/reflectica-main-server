const fs = require('fs');
const path = require('path');
const { db } = require('../config/connection');

class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.logDir = path.join(__dirname, '../logs');
        
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }

        // Firestore collections for logs
        this.logsRef = db.collection('logs');
        
        // Retention periods in days
        this.retentionPeriods = {
            error: 90,
            warn: 60,
            info: 30,
            debug: 30
        };
    }

    _shouldLog(level) {
        const levels = { error: 0, warn: 1, info: 2, debug: 3 };
        return levels[level] <= levels[this.logLevel];
    }

    _formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            ...meta
        };
        return JSON.stringify(logEntry);
    }

    _writeToFile(level, formattedMessage) {
        const fileName = `${level}-${new Date().toISOString().split('T')[0]}.log`;
        const filePath = path.join(this.logDir, fileName);
        
        fs.appendFileSync(filePath, formattedMessage + '\n');
    }

    async _log(level, message, meta = {}) {
        if (!this._shouldLog(level)) return;

        const sanitizedMeta = this._sanitizeMeta(meta);
        const timestamp = new Date().toISOString();
        
        // Log entry for Firestore
        const logEntry = {
            timestamp,
            level,
            message,
            ...sanitizedMeta,
            // TTL field for automatic deletion
            expiresAt: new Date(Date.now() + (this.retentionPeriods[level] * 24 * 60 * 60 * 1000))
        };

        const formattedMessage = JSON.stringify(logEntry);
        
        // Console output (immediate)
        console.log(formattedMessage);
        
        // File output (immediate, for local debugging)
        this._writeToFile(level, formattedMessage);
        
        // Firestore output (async, don't block on failures)
        this._writeToFirestore(logEntry).catch(err => {
            console.error('Failed to write log to Firestore:', err.message);
        });
    }

    _sanitizeMeta(meta) {
        const sanitized = { ...meta };
        const sensitiveFields = [
            'password', 'token', 'key', 'secret', 'authorization', 
            'prompt', 'content', 'transcript', 'userLogs', 'aiLogs',
            'combinedPrompt', 'textResponse', 'body'
        ];
        
        const sanitizeObject = (obj) => {
            for (const key in obj) {
                // Remove undefined values for Firestore compatibility
                if (obj[key] === undefined) {
                    delete obj[key];
                } else if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
                    obj[key] = '[REDACTED]';
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    sanitizeObject(obj[key]);
                }
            }
        };
        
        sanitizeObject(sanitized);
        return sanitized;
    }

    async _writeToFirestore(logEntry) {
        try {
            await this.logsRef.add(logEntry);
        } catch (error) {
            // Don't throw - logging failures shouldn't break the app
            console.error('Firestore logging failed:', error.message);
        }
    }

    error(message, meta = {}) {
        this._log('error', message, meta);
    }

    warn(message, meta = {}) {
        this._log('warn', message, meta);
    }

    info(message, meta = {}) {
        this._log('info', message, meta);
    }

    debug(message, meta = {}) {
        this._log('debug', message, meta);
    }

    requestLogger() {
        return (req, res, next) => {
            const startTime = Date.now();
            
            this.info('Request received', {
                method: req.method,
                url: req.url,
                userAgent: req.get('User-Agent'),
                ip: req.ip || req.connection.remoteAddress,
                sessionId: req.body?.sessionId,
                userId: req.body?.userId
            });

            res.on('finish', () => {
                const duration = Date.now() - startTime;
                this.info('Request completed', {
                    method: req.method,
                    url: req.url,
                    statusCode: res.statusCode,
                    duration: `${duration}ms`
                });
            });

            next();
        };
    }

    errorLogger() {
        return (err, req, res, next) => {
            this.error('Unhandled error', {
                error: err.message,
                stack: err.stack,
                method: req.method,
                url: req.url,
                params: req.params,
                query: req.query,
                statusCode: res.statusCode
            });
            next(err);
        };
    }
}

const logger = new Logger();

process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', {
        error: err.message,
        stack: err.stack
    });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', {
        reason: reason,
        promise: promise
    });
});

module.exports = logger;
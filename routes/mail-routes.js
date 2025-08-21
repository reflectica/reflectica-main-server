const route = require('express').Router()
const { registerEmailForLoopIntoDb, sendSupportMail } = require('../controllers/mail-controllers')
const { 
  asyncHandler, 
  validateRequiredFields, 
  handleDatabaseError,
  createErrorResponse 
} = require('../utils/errorHandler')

route.post("/sendSupportMail", asyncHandler(async (req, res) => {
    validateRequiredFields(['firstName', 'lastName', 'email', 'phoneNumber', 'message'], req.body);
    
    const { firstName, lastName, email, phoneNumber, message } = req.body;

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json(createErrorResponse({
            message: 'Invalid email format',
            code: 'INVALID_EMAIL',
            field: 'email'
        }));
    }

    try {
        await sendSupportMail(firstName, lastName, email, phoneNumber, message);
        res.json({ 
            success: true,
            message: 'Support email sent successfully' 
        });
    } catch (error) {
        handleDatabaseError(error, 'send support email');
    }
}))
  
route.post("/subscribeToLoop", asyncHandler(async (req, res) => {
    validateRequiredFields(['email'], req.body);
    
    const { email } = req.body;

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json(createErrorResponse({
            message: 'Invalid email format',
            code: 'INVALID_EMAIL',
            field: 'email'
        }));
    }

    try {
        await registerEmailForLoopIntoDb(email);
        res.json({ 
            success: true,
            message: 'Successfully subscribed to updates' 
        });
    } catch (error) {
        handleDatabaseError(error, 'subscribe to email updates');
    }
}));

module.exports = route;
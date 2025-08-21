const route = require('express').Router()
const { updateFieldInUserCollection, emailAllUserTranscripts, deleteAllUserSummaries } = require('../controllers/user-controllers')
const { 
  asyncHandler, 
  validateRequiredFields, 
  handleDatabaseError,
  createErrorResponse 
} = require('../utils/errorHandler')

route.post("/updateUserField", asyncHandler(async (req, res) => {
    validateRequiredFields(['value', 'fieldName', 'userId'], req.body);
    
    const { value, fieldName, userId } = req.body;

    // Validate fieldName to prevent injection
    const allowedFields = ['name', 'email', 'preferences', 'language', 'timezone'];
    if (!allowedFields.includes(fieldName)) {
        return res.status(400).json(createErrorResponse({
            message: `Invalid field name. Allowed fields: ${allowedFields.join(', ')}`,
            code: 'INVALID_FIELD_NAME',
            field: 'fieldName'
        }));
    }

    try {
        await updateFieldInUserCollection(userId, value, fieldName);
        res.json({ 
            success: true,
            message: 'User field updated successfully' 
        });
    } catch (error) {
        handleDatabaseError(error, 'update user field');
    }
}))

route.post("/deleteEverythingForUser", asyncHandler(async (req, res) => {
    validateRequiredFields(['userId'], req.body);
    
    const { userId } = req.body;

    try {
        // First email the transcripts before deletion
        try {
            await emailAllUserTranscripts(userId);
        } catch (error) {
            console.warn('Failed to email user transcripts before deletion:', error);
            // Continue with deletion even if email fails
        }

        // Delete all user data
        await deleteAllUserSummaries(userId);
        
        res.json({ 
            success: true,
            message: 'User data deleted successfully' 
        });
    } catch (error) {
        handleDatabaseError(error, 'delete user data');
    }
}))

module.exports = route;
const { authenticateUser } = require('./auth');
const { 
  PERMISSIONS,
  ROLE_PERMISSIONS,
  requirePermission,
  requirePHIRead,
  requirePHIWrite,
  requirePHIDelete,
  requireUserManage,
  requireAuditRead,
  hasPermission,
  canAccessResource,
  auditAccess
} = require('./rbac');

/**
 * Combined middleware for authentication and authorization
 */
const authenticateAndAuthorize = (permission, options = {}) => {
  return [
    authenticateUser,
    requirePermission(permission, options)
  ];
};

/**
 * Helper middlewares that combine auth + specific permissions
 */
const authAndPHIRead = (options) => [authenticateUser, requirePHIRead(options)];
const authAndPHIWrite = (options) => [authenticateUser, requirePHIWrite(options)];
const authAndPHIDelete = (options) => [authenticateUser, requirePHIDelete(options)];
const authAndUserManage = (options) => [authenticateUser, requireUserManage(options)];
const authAndAuditRead = (options) => [authenticateUser, requireAuditRead(options)];

module.exports = {
  // Individual middlewares
  authenticateUser,
  requirePermission,
  requirePHIRead,
  requirePHIWrite,
  requirePHIDelete,
  requireUserManage,
  requireAuditRead,
  
  // Combined middlewares
  authenticateAndAuthorize,
  authAndPHIRead,
  authAndPHIWrite,
  authAndPHIDelete,
  authAndUserManage,
  authAndAuditRead,
  
  // Utilities
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  canAccessResource,
  auditAccess
};
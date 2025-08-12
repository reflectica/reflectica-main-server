const { db } = require('../config/connection');

// Define role permissions
const PERMISSIONS = {
  // PHI (Protected Health Information) permissions
  PHI_READ_OWN: 'phi:read:own',           // Read own PHI data
  PHI_READ_ALL: 'phi:read:all',           // Read all PHI data (admin/auditor)
  PHI_WRITE_OWN: 'phi:write:own',         // Write own PHI data
  PHI_WRITE_ALL: 'phi:write:all',         // Write all PHI data (admin)
  PHI_DELETE_OWN: 'phi:delete:own',       // Delete own PHI data
  PHI_DELETE_ALL: 'phi:delete:all',       // Delete all PHI data (admin)
  
  // User management permissions
  USER_MANAGE: 'user:manage',             // Manage user accounts
  
  // Audit permissions
  AUDIT_READ: 'audit:read',               // Read audit logs
};

// Define roles and their permissions
const ROLE_PERMISSIONS = {
  user: [
    PERMISSIONS.PHI_READ_OWN,
    PERMISSIONS.PHI_WRITE_OWN,
    PERMISSIONS.PHI_DELETE_OWN
  ],
  admin: [
    PERMISSIONS.PHI_READ_ALL,
    PERMISSIONS.PHI_WRITE_ALL,
    PERMISSIONS.PHI_DELETE_ALL,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.AUDIT_READ
  ],
  auditor: [
    PERMISSIONS.PHI_READ_ALL,
    PERMISSIONS.AUDIT_READ
  ]
};

/**
 * Get all permissions for given roles
 */
const getPermissionsForRoles = (roles) => {
  const permissions = new Set();
  roles.forEach(role => {
    const rolePermissions = ROLE_PERMISSIONS[role] || [];
    rolePermissions.forEach(permission => permissions.add(permission));
  });
  return Array.from(permissions);
};

/**
 * Check if user has required permission
 */
const hasPermission = (userRoles, requiredPermission) => {
  const userPermissions = getPermissionsForRoles(userRoles);
  return userPermissions.includes(requiredPermission);
};

/**
 * Check if user can access resource based on ownership
 */
const canAccessResource = (req, resourceUserId, permission) => {
  const userRoles = req.user.roles;
  
  // Check if user has permission for all resources
  if (permission.endsWith(':all')) {
    return hasPermission(userRoles, permission);
  }
  
  // Check if user has permission for own resources and owns the resource
  const ownPermission = permission.replace(':all', ':own');
  if (hasPermission(userRoles, ownPermission) && req.user.uid === resourceUserId) {
    return true;
  }
  
  // Check if user has admin-level permissions
  const allPermission = permission.replace(':own', ':all');
  return hasPermission(userRoles, allPermission);
};

/**
 * Audit access attempts
 */
const auditAccess = async (req, resource, action, result) => {
  try {
    const auditData = {
      timestamp: new Date().toISOString(),
      userId: req.user.uid,
      userEmail: req.user.email,
      userRoles: req.user.roles,
      resource,
      action,
      result, // 'allowed' or 'denied'
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method
    };

    // Log to console for immediate visibility
    console.log(`[AUDIT] ${result.toUpperCase()}: ${req.user.email} (${req.user.roles.join(',')}) ${action} ${resource}`);
    
    // Store in database for persistent auditing
    await db.collection('audit_logs').add(auditData);
  } catch (error) {
    console.error('Audit logging failed:', error);
    // Don't fail the request if audit logging fails
  }
};

/**
 * RBAC middleware factory
 */
const requirePermission = (permission, options = {}) => {
  return async (req, res, next) => {
    try {
      // Ensure user is authenticated
      if (!req.user) {
        await auditAccess(req, options.resource || 'unknown', 'access', 'denied');
        return res.status(401).json({ error: 'Authentication required' });
      }

      let hasAccess = false;
      let resourceUserId = null;

      // Extract resource user ID for ownership checks
      if (options.getUserId) {
        resourceUserId = options.getUserId(req);
      } else {
        // Default: check userId in body or params
        resourceUserId = req.body.userId || req.params.userId;
      }

      // Check permission
      if (resourceUserId) {
        hasAccess = canAccessResource(req, resourceUserId, permission);
      } else {
        hasAccess = hasPermission(req.user.roles, permission);
      }

      const resource = options.resource || req.path;
      
      if (hasAccess) {
        await auditAccess(req, resource, 'access', 'allowed');
        next();
      } else {
        await auditAccess(req, resource, 'access', 'denied');
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: permission,
          userRoles: req.user.roles
        });
      }
    } catch (error) {
      console.error('RBAC middleware error:', error);
      await auditAccess(req, options.resource || 'unknown', 'access', 'error');
      return res.status(500).json({ error: 'Authorization check failed' });
    }
  };
};

/**
 * Helper functions for common PHI permissions
 */
const requirePHIRead = (options) => requirePermission(PERMISSIONS.PHI_READ_OWN, options);
const requirePHIWrite = (options) => requirePermission(PERMISSIONS.PHI_WRITE_OWN, options);
const requirePHIDelete = (options) => requirePermission(PERMISSIONS.PHI_DELETE_OWN, options);
const requireUserManage = (options) => requirePermission(PERMISSIONS.USER_MANAGE, options);
const requireAuditRead = (options) => requirePermission(PERMISSIONS.AUDIT_READ, options);

module.exports = {
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
};
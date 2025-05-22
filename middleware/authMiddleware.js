// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || "devsecret_fallback_do_not_use_in_prod"; // Should match what's in authController

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    // Extract token from "Bearer <token>"
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired. Please log in again.' });
      }
      if (err.name === 'JsonWebTokenError') {
        return res.status(403).json({ error: 'Access denied. Invalid token.' });
      }
      // For other errors, it might still be a server-side issue or an unexpected token problem
      console.error("JWT Verification Error:", err);
      return res.status(403).json({ error: 'Access denied. Token verification failed.' });
    }
    
    // Add decoded user payload (e.g., id and role) to the request object
    // This payload comes from what we put into jwt.sign() in authController.js
    req.user = { id: decoded.userId, role: decoded.role }; 
    next(); // Proceed to the next middleware or route handler
  });
}

// Optional: Middleware to check for specific roles
// roles can be a single role string (e.g., 'admin') or an array of role strings (e.g., ['admin', 'editor'])
function authorizeRole(roles) { 
  const requiredRoles = Array.isArray(roles) ? roles : [roles]; // Ensure roles is an array

  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      // This should ideally not happen if authenticateToken ran successfully
      return res.status(403).json({ error: 'Forbidden: User role not available.' });
    }
    
    if (!requiredRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: You do not have the required role for this action.' });
    }
    next(); // User has one of the required roles
  };
}

module.exports = { 
  authenticateToken, 
  authorizeRole 
};
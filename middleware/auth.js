/**
 * Unified Authentication Middleware
 * Single source of truth for token validation
 * Used by both app.js and routes/auth.js
 */

const User = require("../models/User");

/**
 * Middleware to verify session tokens
 * Checks if token exists and is not expired
 */
const authMiddleware = async (req, res, next) => {
  const authorizationHeader = req.header("Authorization");
  console.log("Authorization Header:", authorizationHeader); // Log header

  if (!authorizationHeader) {
    return res.status(401).json({ 
      status: "error",
      message: "Unauthorized: Missing Authorization header" 
    });
  }

  const sessionToken = authorizationHeader.replace("Bearer ", "").trim();
  console.log("Session Token:", sessionToken); // Log token

  if (!sessionToken) {
    return res.status(401).json({ 
      status: "error",
      message: "Unauthorized: Missing session token" 
    });
  }

  try {
    // Check for token expiration
    const user = await User.findOne({
      sessionToken,
      $or: [
        { tokenExpiresAt: null }, // No expiration set (legacy tokens)
        { tokenExpiresAt: { $gt: new Date() } } // Token not expired
      ]
    });

    console.log("User Found:", user ? { id: user._id, email: user.email } : null); // Log user data

    if (!user) {
      // Check if token exists but is expired
      const expiredUser = await User.findOne({ sessionToken });
      if (expiredUser) {
        console.log("Token exists but is expired");
        return res.status(401).json({ 
          status: "error",
          message: "Unauthorized: Session token has expired. Please log in again." 
        });
      }
      
      console.log("Token validation failed - token not found in database");
      return res.status(401).json({ 
        status: "error",
        message: "Unauthorized: Invalid session token" 
      });
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (err) {
    console.error("Error in authMiddleware:", err);
    res.status(500).json({ 
      status: "error",
      message: "Internal Server Error" 
    });
  }
};

module.exports = authMiddleware;


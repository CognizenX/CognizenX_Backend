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

  if (!authorizationHeader) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: Missing Authorization header",
    });
  }

  const sessionToken = authorizationHeader.replace("Bearer ", "").trim();

  if (!sessionToken) {
    return res.status(401).json({
      status: "error",
      message: "Unauthorized: Missing session token",
    });
  }

  try {
    const user = await User.findOne({
      sessionToken,
      $or: [
        { tokenExpiresAt: null },
        { tokenExpiresAt: { $gt: new Date() } },
      ],
    });

    if (!user) {
      const expiredUser = await User.findOne({ sessionToken });
      if (expiredUser) {
        return res.status(401).json({
          status: "error",
          message: "Unauthorized: Session token has expired. Please log in again.",
        });
      }

      return res.status(401).json({
        status: "error",
        message: "Unauthorized: Invalid session token",
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Error in authMiddleware:", err);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
};

module.exports = authMiddleware;

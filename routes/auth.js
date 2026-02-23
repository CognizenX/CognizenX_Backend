const express = require("express");
const crypto = require("crypto"); // Import the crypto module
const bcrypt = require("bcryptjs");
const { validate, signupSchema, loginSchema } = require("../middleware/validate");
const User = require("../models/User");
const UserActivity = require('../models/UserActivity');
const mailer = require('../services/mailer');


const router = express.Router();

// Use unified authentication middleware
const authMiddleware = require("../middleware/auth");

/**
 * Helper: Verify token was saved to database
 * Critical for serverless functions where writes might not be immediately available
 */
const verifyTokenSave = async (userId, sessionToken, userEmail) => {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      await new Promise(resolve => setTimeout(resolve, 50 * attempt));
    }

    const verifiedUser = await User.findOne({ _id: userId, sessionToken });
    if (verifiedUser && verifiedUser.sessionToken === sessionToken) {
      console.log(`Token verified on attempt ${attempt} for user: ${userEmail}`);
      return true;
    }

    if (attempt === 1) {
      console.log(`Token verification attempt ${attempt} failed for user: ${userEmail}`);
    }
  }

  console.error(`CRITICAL: Token not found in database after save for user: ${userEmail}`);
  console.warn("Continuing anyway - token should be available shortly");
  return false;
};

// Endpoint to fetch user ID
router.get("/get-user-id", authMiddleware, async (req, res) => {
  try {
    // The user is already authenticated and available in `req.user` from the authMiddleware
    const userId = req.user._id; // Get the user's ID
    res.json({ userId });
  } catch (err) {
    console.error("Error fetching user ID:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
router.post("/signup", validate(signupSchema), async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    console.log("Signup attempt for email:", email);

    // Check for existing user (this will throw duplicate key error if race condition)
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const sessionToken = crypto.randomBytes(64).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      sessionToken,
      tokenExpiresAt: expiresAt
    });

    // Save the user to database
    try {
      await newUser.save();
      console.log("User saved with sessionToken:", email);
    } catch (saveError) {
      console.error("Error saving new user:", saveError);
      throw saveError;
    }

    // Verify token was saved to database
    await verifyTokenSave(newUser._id, sessionToken, email);

    console.log("User created successfully:", email);

    res.status(201).json({
      sessionToken,
      expiresAt,
      message: "Account created successfully"
    });
  } catch (err) {
    console.error("Signup Error:", err);
    return next(err);
  }
});
router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    console.log("Login attempt for email:", email);

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    console.log("Hashed Password in DB:", user.password);

    const isMatch = await bcrypt.compare(password, user.password);
    console.log("Password Match:", isMatch);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const sessionToken = crypto.randomBytes(64).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    user.sessionToken = sessionToken;
    user.tokenExpiresAt = expiresAt;
    
    // Save the token to database
    try {
      await user.save();
      console.log("User saved with sessionToken:", email);
    } catch (saveError) {
      console.error("Error saving user sessionToken:", saveError);
      throw saveError;
    }

    // Verify token was saved to database
    await verifyTokenSave(user._id, sessionToken, email);

    console.log("User logged in successfully:", email);

    res.json({
      sessionToken,
      expiresAt,
      message: "Login successful"
    });
  } catch (err) {
    console.error("Login Error:", err);
    return next(err);
  }
});

// Request Password Reset: POST /api/auth/request-password-reset
router.post("/request-password-reset", async (req, res) => {
  try {
    const { email } = req.body || {};
    console.log('[request-password-reset] incoming email:', email);
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email: String(email).toLowerCase() });
    // Always respond with success to avoid user enumeration
    const genericResponse = { message: "If that email exists, a reset link has been sent." };

    if (!user) {
      console.log('[request-password-reset] no user found for email');
      return res.json(genericResponse);
    }

    // Generate token and save hashed version
    const rawToken = user.generatePasswordReset();
    await user.save();

    // Build reset link using RESET_URL as the full destination (with or without a path)
    // Examples:
    //  - RESET_URL=https://reset-password-sigma.vercel.app            => https://.../?token=...&email=...
    //  - RESET_URL=https://reset-password-sigma.vercel.app/reset-password => https://.../reset-password?token=...&email=...
    const resetBase = process.env.RESET_URL || `${req.protocol}://${req.get('host')}/reset-password`;
    let resetUrl;
    try {
      resetUrl = new URL(resetBase);
    } catch (e) {
      // Fallback if provided RESET_URL is missing protocol; assume https
      resetUrl = new URL(`https://${resetBase}`);
    }
    resetUrl.searchParams.set('token', rawToken);
    resetUrl.searchParams.set('email', user.email);
    const resetLink = resetUrl.toString();

    if (process.env.NODE_ENV !== 'production') {
      console.log('[request-password-reset] dev reset link:', resetLink);
    }

    try {
      await mailer.sendPasswordReset(user.email, resetLink);
      console.log('[request-password-reset] email send attempted via SendGrid');
    } catch (mailErr) {
      console.error('Failed to send reset email:', mailErr);
      // Still return generic success to the client
    }

    return res.json(genericResponse);
  } catch (err) {
    console.error('request-password-reset error:', err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Reset Password: POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    const hashed = crypto.createHash('sha256').update(String(token)).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashed,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    // Hash new password and clear reset fields
    const saltRounds = 10;
    const newHashed = await bcrypt.hash(password, saltRounds);
    user.password = newHashed;
    user.clearPasswordReset();
    // Invalidate existing session token (force re-login)
    user.sessionToken = undefined;
    await user.save();

    return res.json({ message: 'Password has been reset successfully. Please log in.' });
  } catch (err) {
    console.error('reset-password error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// DELETE /api/auth/delete-account
router.delete("/delete-account", authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user._id;

    // 1) Remove any activity logs (optional)
    await UserActivity.deleteMany({ userId });

    // 2) Remove the user
    await User.findByIdAndDelete(userId);

    // 3) (Optionally) You could also revoke tokens, clear cookies, etc.

    console.log("Account deleted successfully for user:", userId);
    res.json({ message: "Account deleted successfully." });
  } catch (err) {
    console.error("Error deleting account:", err);
    return next(err);
  }
});


module.exports = router;

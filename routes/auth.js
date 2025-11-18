const express = require("express");
const crypto = require("crypto"); // Import the crypto module
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const UserActivity = require('../models/UserActivity');
const mailer = require('../services/mailer');


const router = express.Router();

// Middleware to verify session tokens
const authMiddleware = async (req, res, next) => {
  const authorizationHeader = req.header("Authorization");
  console.log("Authorization Header:", authorizationHeader); // Log the raw header

  if (!authorizationHeader) {
    return res.status(401).json({ message: "Unauthorized: Missing Authorization header" });
  }

  const sessionToken = authorizationHeader.replace("Bearer ", "").trim();
  console.log("Session Token Received:", sessionToken); // Log the token received from the client

  if (!sessionToken) {
    return res.status(401).json({ message: "Unauthorized: Missing session token" });
  }

  try {
    const user = await User.findOne({ sessionToken });
    console.log("User Found:", user); // Log the user object or null if not found

    if (!user) {
      return res.status(401).json({ message: "Unauthorized: Invalid session token" });
    }

    req.user = user; // Attach user to request
    next();
  } catch (err) {
    console.error("Error in authMiddleware:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
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
router.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Hashed Password for Signup:", hashedPassword);

    const sessionToken = crypto.randomBytes(64).toString("hex");

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      sessionToken,
    });

    await newUser.save();
    res.status(201).json({ sessionToken });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    console.log("User Found:", user);

    if (!user) return res.status(400).json({ message: "User not found" });

    console.log("Hashed Password in DB:", user.password);

    const isMatch = await bcrypt.compare(password, user.password);
    console.log("Password Match:", isMatch);

    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const sessionToken = crypto.randomBytes(64).toString("hex");
    user.sessionToken = sessionToken;
    await user.save();
    console.log("Session Token Saved:", sessionToken);

    res.json({ sessionToken });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ message: "Internal Server Error" });
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
router.delete("/delete-account", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    // 1) Remove any activity logs (optional)
    await UserActivity.deleteMany({ userId });

    // 2) Remove the user
    await User.findByIdAndDelete(userId);

    // 3) (Optionally) You could also revoke tokens, clear cookies, etc.

    res.json({ message: "Account deleted successfully." });
  } catch (err) {
    console.error("Error deleting account:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


module.exports = router;

const express = require("express");
const crypto = require("crypto"); // Import the crypto module
const bcrypt = require("bcryptjs");
const Joi = require('joi');
const User = require("../models/User");
const UserActivity = require('../models/UserActivity');

// Input validation schemas
const signupSchema = Joi.object({
  name: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s]+$/).required(),
  email: Joi.string().email().max(100).required(),
  password: Joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().max(100).required(),
  password: Joi.string().required()
});


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
    const user = await User.findOne({
      sessionToken,
      $or: [
        { tokenExpiresAt: null }, // No expiration set (legacy tokens)
        { tokenExpiresAt: { $gt: new Date() } } // Token not expired
      ]
    });

    if (!user) {
      return res.status(401).json({ message: "Unauthorized: Invalid or expired session token" });
    }

    req.user = user; // Attach user to request
    next();
  } catch (err) {
    console.error("Error in authMiddleware:", err);
    throw err; // Let centralized error handler deal with it
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
  try {
    // Validate input using Joi schema
    const { error, value } = signupSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        message: 'Validation error',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    const { name, email, password } = value;

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

    await newUser.save();
    console.log("User created successfully:", email);

    res.status(201).json({
      sessionToken,
      expiresAt,
      message: "Account created successfully"
    });
  } catch (err) {
    console.error("Signup Error:", err);
    // Let the centralized error handler deal with it
    throw err;
  }
});
router.post("/login", async (req, res) => {
  try {
    // Validate input using Joi schema
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        message: 'Validation error',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    const { email, password } = value;

    console.log("Login attempt for email:", email);

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    console.log("Plain Password Input:", password);
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
    await user.save();

    console.log("User logged in successfully:", email);

    res.json({
      sessionToken,
      expiresAt,
      message: "Login successful"
    });
  } catch (err) {
    console.error("Login Error:", err);
    throw err; // Let centralized error handler deal with it
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

    console.log("Account deleted successfully for user:", userId);
    res.json({ message: "Account deleted successfully." });
  } catch (err) {
    console.error("Error deleting account:", err);
    throw err; // Let centralized error handler deal with it
  }
});


module.exports = router;

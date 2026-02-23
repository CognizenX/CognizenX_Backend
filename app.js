// CognigenX Backend API
// 
// BACKWARD COMPATIBILITY STRATEGY:
// - ALL existing endpoints are preserved and unchanged
// - New endpoints are added ALONGSIDE existing ones (not replacing)
// - No breaking changes to request/response formats
// - Existing frontend continues to work without modification
//
// EXISTING ENDPOINTS (Preserved - DO NOT MODIFY):
// - GET /api/random-questions - Quiz generation (unchanged)
// - POST /api/generate-questions - Admin question generation (unchanged)
// - POST /api/generate-explanation - Explanation generation (unchanged)
// - POST /api/add-questions - Manual question addition (unchanged)
// - All /api/auth/* endpoints (unchanged)
// - All /api/users endpoints (unchanged)
//
// NEW ENDPOINTS (Added alongside - Phase 2 of refactor):
// - GET /api/user-quiz - Personalized quiz (new, doesn't replace /api/random-questions)
// - POST /api/submit-quiz - Quiz submission with progress tracking (new)
// - GET /api/analytics/* - Analytics endpoints (new)
//
// Security: OpenAI API keys moved from frontend to backend
// Backward Compatibility: 100% maintained for existing App Store frontend

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const axios = require("axios");
const crypto = require("crypto");
const TriviaCategory = require("./models/TriviaCategory");
const UserActivity = require("./models/UserActivity");
const User = require("./models/User");

// Config imports
const { connectDatabase } = require("./config/database");
const { authLimiter, globalLimiter } = require("./config/rateLimiter");
const { categories, categorizeArticle } = require("./config/categories");

const app = express();

// Security middleware
const helmet = require('helmet');

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Rate limiting (configured in config/rateLimiter.js)
app.use('/api/auth', authLimiter);
app.use(globalLimiter);

// Centralized error handling middleware
const errorHandler = require("./middleware/errorHandler");

// Use unified authentication middleware
const authMiddleware = require("./middleware/auth");

// Sample route for base
app.get("/", (req, res) => {
  res.json({ message: "Backend running on Vercel! Base route /" });
});

// Sample route
app.get("/api", (req, res) => {
  res.json({ message: "Backend running on Vercel!" });
});



//Endpoint for user preferences
app.get("/api/user-preferences", authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user._id; // From authMiddleware
    console.log("Fetching preferences for User ID:", userId);

    const activity = await UserActivity.findOne({ userId });
    if (!activity || activity.categories.length === 0) {
      return res.json({ preferences: [] }); // Return empty preferences if no activity found
    }

    const preferences = activity.categories.map((category) => ({
      category: category.category,
      subDomain: category.domain,
      count: category.count,
    }));

    // Sort preferences by count (most frequent first)
    preferences.sort((a, b) => b.count - a.count);

    res.json({ preferences });
  } catch (err) {
    console.error("Error fetching preferences:", err);
    next(err);
  }
});

// Endpoint to Log User Activity
app.post("/api/log-activity", authMiddleware, async (req, res, next) => {
  const { category, domain } = req.body;
  console.log("req.body", req.body)
  console.log("category", category)
  console.log("domain", domain)
  if (!category || !domain) {
    return res.status(400).json({ 
      status: "error", 
      message: "Both category and domain are required." 
    });
  }

  try {
    const userId = req.user._id; // Get user ID from authMiddleware
    let activity = await UserActivity.findOne({ userId });

    if (!activity) {
      activity = new UserActivity({ userId, categories: [] });
    }

    const categoryIndex = activity.categories.findIndex(
      (c) => c.category === category && c.domain === domain
    );

    if (categoryIndex >= 0) {
      activity.categories[categoryIndex].count += 1;
      activity.categories[categoryIndex].lastPlayed = new Date();
    } else {
      activity.categories.push({ 
        category, 
        domain,
        count: 1, 
        lastPlayed: new Date() 
      });
    }

    await activity.save();

    res.json({ status: "success", message: "Activity logged successfully." });
  } catch (error) {
    console.error("Error logging activity:", error);
    next(error);
  }
});

// Connect to database (skipped in test mode)
connectDatabase();

// Routes
const authRoutes = require("./routes/auth");
const questionsRoutes = require("./routes/questions");
const aiRoutes = require("./routes/ai");
const usersRoutes = require("./routes/users");

app.use("/api/auth", authRoutes);
app.use("/api", questionsRoutes);
app.use("/api", aiRoutes);
app.use("/api/users", usersRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app; // Export app for Vercel, testing
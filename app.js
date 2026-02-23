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

// Connect to database (skipped in test mode)
connectDatabase();

// Routes
const authRoutes = require("./routes/auth");
const questionsRoutes = require("./routes/questions");
const aiRoutes = require("./routes/ai");
const usersRoutes = require("./routes/users");
const activityRoutes = require("./routes/activity");

app.use("/api/auth", authRoutes);
app.use("/api", questionsRoutes);
app.use("/api", aiRoutes);
app.use("/api/users", usersRoutes);
app.use("/api", activityRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app; // Export app for Vercel, testing
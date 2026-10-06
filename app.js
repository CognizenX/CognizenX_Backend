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
const { connectDatabase, ensureDatabase } = require("./config/database");
const { authLimiter, globalLimiter } = require("./config/rateLimiter");
const { categories, categorizeArticle } = require("./config/categories");

const app = express();

// Trust the upstream proxy (Vercel/local reverse proxies) so req.ip and rate limiting
// use the real client address (from X-Forwarded-For).
app.set("trust proxy", true);

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
// Dual-mount: store builds use /api/auth; P0 clients use /api/v1/auth.
app.use("/api/auth", authLimiter);
app.use("/api/v1/auth", authLimiter);
app.use(globalLimiter);

// P0.6A — optional force-update gate (off unless MIN_SUPPORTED_APP_VERSION is set)
const { requireMinAppVersion } = require("./middleware/minAppVersion");
app.use(requireMinAppVersion);

// Ensure MongoDB is connected before handling requests (fixes serverless buffering timeout)
app.use((req, res, next) => {
  ensureDatabase()
    .then(() => next())
    .catch((err) => {
      console.error("Database not available:", err?.message || err);
      res.status(503).json({ status: "error", message: "Service temporarily unavailable" });
    });
});

// Centralized error handling middleware
const errorHandler = require("./middleware/errorHandler");

// Use unified authentication middleware
const authMiddleware = require("./middleware/auth");

// Sample route for base
app.get("/", (req, res) => {
  res.json({ message: "Backend running on Vercel! Base route /" });
});

// Sample route (unversioned + v1)
app.get("/api", (req, res) => {
  res.json({ message: "Backend running on Vercel!" });
});
app.get("/api/v1", (req, res) => {
  res.json({ message: "Backend running on Vercel!", apiVersion: "v1" });
});

// Connect to database (skipped in test mode)
connectDatabase();

// Routes
const authRoutes = require("./routes/auth");
const questionsRoutes = require("./routes/questions");
const aiRoutes = require("./routes/ai");
const usersRoutes = require("./routes/users");
const activityRoutes = require("./routes/activity");
const triviaRoutes = require("./routes/trivia");
const reportsRoutes = require("./routes/reports");
const userQuizRoutes = require("./routes/userQuiz");
const gamesRoutes = require("./routes/games");

// P0.6A — same handlers on /api (legacy store) and /api/v1 (new clients).
// Do not remove /api until the forced-update screen is live and the store
// build is the minimum supported version.
function mountApiRoutes(basePath) {
  app.use(`${basePath}/auth`, authRoutes);
  app.use(basePath, questionsRoutes);
  app.use(basePath, userQuizRoutes);
  app.use(basePath, aiRoutes);
  app.use(`${basePath}/users`, usersRoutes);
  app.use(basePath, activityRoutes);
  app.use(`${basePath}/trivia`, triviaRoutes);
  app.use(`${basePath}/games`, gamesRoutes);
  app.use(basePath, reportsRoutes);
}

mountApiRoutes("/api");
mountApiRoutes("/api/v1");

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app; // Export app for Vercel, testing
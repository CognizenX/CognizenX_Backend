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
const Joi = require('joi');
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
const {
  formatQuestion,
  formatQuestions,
  deduplicateAgainst,
  normaliseForResponse,
} = require("./utils/questionFormatter");

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

// Input validation schemas
const signupSchema = Joi.object({
  name: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s]+$/).required(),
  email: Joi.string().email().max(100).required(),
  password: Joi.string().min(6).max(128).required() // Simple password - just min 6 chars, no complexity required
});

const loginSchema = Joi.object({
  email: Joi.string().email().max(100).required(),
  password: Joi.string().required()
});

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

// Updated Endpoint to Add Questions
app.post("/api/add-questions", async (req, res, next) => {
  console.log(req.body);

  const { category, domain, questions } = req.body;

  try {
    let triviaCategory = await TriviaCategory.findOne({ category, domain });

    if (!triviaCategory) {
      triviaCategory = new TriviaCategory({
        category,
        domain,
        questions: [],
      });
    }

    const formatted = questions.map(q => formatQuestion(q, { subDomain: q.subDomain }));
    const { unique, addedCount, duplicateCount } = deduplicateAgainst(
      formatted,
      triviaCategory.questions,
      '/api/add-questions'
    );
    triviaCategory.questions.push(...unique);
    
    console.log(`Added ${addedCount} new questions, skipped ${duplicateCount} duplicates`);

    await triviaCategory.save();

    res.json({
      status: "success",
      message: "Questions added successfully!",
      data: triviaCategory,
    });
  } catch (error) {
    console.error("Error saving questions:", error);
    next(error);
  }
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

// Questions Fetch Endpoint
app.get("/api/questions", async (req, res, next) => {
  const { category, subDomain } = req.query;

  if (!category || !subDomain) {
    return res.status(400).json({
      status: "error",
      message: "Category and subDomain are required parameters.",
    });
  }
  try {
    const triviaCategory = await TriviaCategory.findOne({ category, domain: subDomain });

    if (!triviaCategory || !triviaCategory.questions.length) {
      return res.status(404).json({
        status: "error",
        message: "No questions found for the specified category and subDomain.",
      });
    }

    res.json({
      status: "success",
      questions: triviaCategory.questions.map(normaliseForResponse),
    });
  } catch (error) {
    console.log(error)
    next(error);
  }
});


// Import OpenAI service
const { generateQuestions, generateExplanation } = require('./services/openaiService');

app.get('/api/random-questions', async (req, res) => {
  const { categories, subDomain, useSaved = 'false' } = req.query; // Comma-separated list of categories, optional subDomain, optional useSaved flag

  if (!categories) {
    return res.status(400).json({ message: 'Categories are required.' });
  }

  const categoryList = categories.split(',');
  const shouldUseSaved = useSaved === 'true' || useSaved === true;

  try {
    let newQuestions = [];
    let savedQuestions = [];
    
    // For each category, generate new questions and get saved ones
    for (const category of categoryList) {
      // Determine the domain/subDomain to use
      const domainToUse = subDomain || category;
      
      // First, try to get saved questions from the bank
      const query = subDomain 
        ? { category, domain: subDomain }
        : { category };
      
      let triviaCategory = await TriviaCategory.findOne(query);
      
      // If no questions exist for this category/subDomain, try to find any questions for the category
      if (!triviaCategory || triviaCategory.questions.length === 0) {
        const anyCategoryQuestions = await TriviaCategory.findOne({ category });
        if (anyCategoryQuestions && anyCategoryQuestions.questions.length > 0) {
          triviaCategory = anyCategoryQuestions;
        }
      }
      
      // Collect saved questions
      if (triviaCategory && triviaCategory.questions.length > 0) {
        let categorySavedQuestions = [];
        if (subDomain) {
          categorySavedQuestions = triviaCategory.questions.filter(q => {
            const questionSubDomain = q.subDomain || triviaCategory.domain;
            return questionSubDomain === subDomain || triviaCategory.domain === subDomain;
          });
        } else {
          categorySavedQuestions = triviaCategory.questions;
        }
        savedQuestions.push(...categorySavedQuestions);
      }
      
      // Try to generate NEW questions for this quiz session (10 new questions needed)
      if (!shouldUseSaved) {
        console.log(`[QUESTION GENERATION] Starting generation for category: "${category}", domain: "${domainToUse}"`);
        
        try {
          // Generate 10 new questions for this category/subDomain
          console.log(`[QUESTION GENERATION] Calling OpenAI API for ${category}/${domainToUse}...`);
          const generatedQuestions = await generateQuestions(category, domainToUse, 10);
          console.log(`[QUESTION GENERATION] OpenAI returned ${generatedQuestions.length} questions for ${category}/${domainToUse}`);
          
          // Format the generated questions
          const formattedQuestions = formatQuestions(generatedQuestions, {
            category,
            subDomain: domainToUse,
            aiGenerated: true,
          });
          
          // Add generated questions to the response
          newQuestions.push(...formattedQuestions);
          
          // Save generated questions to database for future reference
          let triviaCategoryForSave = await TriviaCategory.findOne({ category, domain: domainToUse });
          if (!triviaCategoryForSave) {
            triviaCategoryForSave = new TriviaCategory({ 
              category, 
              domain: domainToUse, 
              questions: [] 
            });
          }
          
          // Add new questions to the database (avoid duplicates by checking question text)
          const { unique, addedCount, duplicateCount } = deduplicateAgainst(
            formattedQuestions,
            triviaCategoryForSave.questions,
            '/api/random-questions'
          );
          triviaCategoryForSave.questions.push(...unique);
          
          await triviaCategoryForSave.save();
          console.log(`Generated and saved ${addedCount} new questions for ${category}/${domainToUse} (${duplicateCount} duplicates skipped)`);
        } catch (genError) {
          console.error(`[QUESTION GENERATION] FAILED for ${category}/${domainToUse}:`, genError.message);
          console.error(`[QUESTION GENERATION] Error details:`, {
            category,
            domainToUse,
            errorType: genError.constructor?.name,
            errorMessage: genError.message,
            hasApiKey: !!process.env.OPENAI_API_KEY
          });
          // If generation fails, we'll use saved questions as fallback
          if (genError.message?.includes('API key')) {
            console.warn(`[QUESTION GENERATION] OpenAI API key issue for ${category}/${domainToUse} - will use saved questions only`);
          } else {
            console.warn(`[QUESTION GENERATION] Generation failed for ${category}/${domainToUse} - will use saved questions as fallback`);
          }
        }
      }
    }
    
    // Use 10 new AI-generated questions, or fallback to saved questions if generation fails
    let finalQuestions = [];
    
    if (newQuestions.length >= 10) {
      // We have enough new questions - use all 10
      finalQuestions = newQuestions.sort(() => Math.random() - 0.5).slice(0, 10);
    } else if (newQuestions.length > 0) {
      // We have some new questions but not enough - use what we have (shouldn't happen normally)
      console.log(`Warning: Only generated ${newQuestions.length} questions, expected 10`);
      finalQuestions = newQuestions.sort(() => Math.random() - 0.5);
      // Try to fill remaining slots from saved questions if available
      if (savedQuestions.length > 0 && finalQuestions.length < 10) {
        const neededFromSaved = 10 - finalQuestions.length;
        const shuffledSaved = savedQuestions.sort(() => Math.random() - 0.5).slice(0, neededFromSaved);
        finalQuestions = [...finalQuestions, ...shuffledSaved];
      }
    } else if (savedQuestions.length > 0) {
      // Can't generate new questions - use all 10 from bank as fallback
      console.log(`Using all ${Math.min(savedQuestions.length, 10)} questions from bank (generation failed)`);
      finalQuestions = savedQuestions.sort(() => Math.random() - 0.5).slice(0, 10);
    }
    
    if (finalQuestions.length === 0) {
      return res.status(200).json({
        questions: [],
        totalAvailable: 0,
        generated: 0,
        message: subDomain 
          ? `No questions available for ${categoryList.join(', ')} / ${subDomain}. Please check OpenAI API configuration.`
          : 'No questions available for the selected categories. Please check OpenAI API configuration.'
      });
    }
    
    // Final shuffle for randomness (finalQuestions is already limited to 10)
    const shuffledFinal = finalQuestions.sort(() => Math.random() - 0.5);
    
    // Ensure backward compatibility for existing questions
    const compatibleQuestions = shuffledFinal.map(normaliseForResponse);
    
    res.json({ 
      questions: compatibleQuestions,
      totalAvailable: finalQuestions.length,
      generated: compatibleQuestions.filter(q => q.aiGenerated).length
    });
  } catch (error) {
    console.error('Error fetching random questions:', error);
    res.status(500).json({ message: 'Failed to fetch questions.' });
  }
});

// New endpoint for AI-generated questions
app.post("/api/generate-questions", authMiddleware, async (req, res, next) => {
  try {
    const { category, subDomain, count = 10 } = req.body;
    if (!category) {
      return res.status(400).json({ status: "error", message: "Category is required" });
    }
    
    const questions = await generateQuestions(category, subDomain, count);
    
    let triviaCategory = await TriviaCategory.findOne({ category, domain: subDomain });
    if (!triviaCategory) {
      triviaCategory = new TriviaCategory({ category, domain: subDomain, questions: [] });
    }
    
    const formattedQuestions = formatQuestions(questions, {
      category,
      subDomain,
      aiGenerated: true,
    });
    
    // Add new questions to the database (avoid duplicates by checking question text)
    const { unique, addedCount, duplicateCount } = deduplicateAgainst(
      formattedQuestions,
      triviaCategory.questions,
      '/api/generate-questions'
    );
    triviaCategory.questions.push(...unique);
    
    await triviaCategory.save();
    console.log(`Generated questions: ${addedCount} added, ${duplicateCount} duplicates skipped`);
    
    res.json({ 
      status: "success", 
      message: `Generated ${formattedQuestions.length} questions`,
      questions: formattedQuestions
    });
  } catch (error) {
    console.error('Error generating questions:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', req.body);
    console.error('Request user:', req.user?._id);
    
    const errorMessage = error.message || 'Unknown error occurred';
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
    
    res.status(500).json({ 
      status: "error", 
      message: errorMessage,
      error: isDevelopment ? {
        message: errorMessage,
        stack: error.stack,
        type: error.constructor?.name
      } : undefined
    });
  }
});

// New endpoint for AI-generated explanations
app.post("/api/generate-explanation", authMiddleware, async (req, res, next) => {
  try {
    const { question, userAnswer, correctAnswer, questionId, category, subDomain } = req.body;
    if (!question || !userAnswer || !correctAnswer) {
      return res.status(400).json({ status: "error", message: "Question, user answer, and correct answer are required" });
    }
    
    console.log('Explanation request:', { questionId, category, subDomain, hasQuestion: !!question });
    
    // Try to find cached explanation if questionId, category, and subDomain are provided
    let explanation = null;
    if (questionId && category && subDomain) {
      const triviaCategory = await TriviaCategory.findOne({ category, domain: subDomain });
      if (triviaCategory) {
        console.log('Found trivia category, looking for question:', questionId);
        const questionObj = triviaCategory.questions.id(questionId);
        if (questionObj && questionObj.explanation) {
          console.log('Returning cached explanation');
          // Return cached explanation
          return res.json({ 
            status: "success", 
            explanation: questionObj.explanation,
            cached: true 
          });
        } else if (questionObj) {
          console.log('Question found but no cached explanation');
        } else {
          console.log('Question not found in category');
        }
      } else {
        console.log('Trivia category not found:', { category, subDomain });
      }
    }
    
    // Generate new explanation
    console.log('Generating new explanation via OpenAI...');
    explanation = await generateExplanation(question, userAnswer, correctAnswer);
    console.log('Explanation generated, length:', explanation?.length);
    
    // Save explanation to database if questionId, category, and subDomain are provided
    if (questionId && category && subDomain && explanation) {
      console.log('Attempting to save explanation to database...');
      const triviaCategory = await TriviaCategory.findOne({ category, domain: subDomain });
      if (triviaCategory) {
        const questionObj = triviaCategory.questions.id(questionId);
        if (questionObj) {
          questionObj.explanation = explanation;
          questionObj.explanationGeneratedAt = new Date();
          await triviaCategory.save();
          console.log('Explanation saved successfully to database');
        } else {
          console.log('Could not find question to save explanation:', questionId);
        }
      } else {
        console.log('Could not find trivia category to save explanation:', { category, subDomain });
      }
    } else {
      console.log('Skipping save - missing params:', { questionId: !!questionId, category: !!category, subDomain: !!subDomain, explanation: !!explanation });
    }
    
    res.json({ status: "success", explanation: explanation, cached: false });
  } catch (error) {
    console.error('Error generating explanation:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', req.body);
    console.error('Request user:', req.user?._id);
    
    const errorMessage = error.message || 'Unknown error occurred';
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
    
    res.status(500).json({ 
      status: "error", 
      message: errorMessage,
      error: isDevelopment ? {
        message: errorMessage,
        stack: error.stack,
        type: error.constructor?.name
      } : undefined
    });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find();
    res.json({users: users});
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users.' });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const userActivities = await UserActivity.findOne({ userId: user._id });
    
    // Manually attach "activities" field
    if (userActivities) {
      user._doc.activities = userActivities.categories;
    } else {
      user._doc.activities = []; // empty if no activity found
    }

    res.json({user: user});
  } catch (error) {
    console.error("Error fetch specific user:", error);
    res.status(500).json({ message: 'Failed to fetch users.' });
  }
})

// Connect to database (skipped in test mode)
connectDatabase();


// Routes
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = app; // Export app for Vercel, testing
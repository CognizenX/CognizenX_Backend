// CognigenX Backend API
// 
// NEW AI ENDPOINTS (Added for production):
// POST /api/generate-questions - Generate AI trivia questions
// POST /api/generate-explanation - Generate AI explanations for answers
//
// EXISTING ENDPOINTS (Unchanged for backward compatibility):
// All existing auth, trivia, and user endpoints remain unchanged
//
// Security: OpenAI API keys moved from frontend to backend
// Backward Compatibility: 100% maintained for existing App Store frontend

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const axios = require("axios");
const crypto = require("crypto");
const Trivia = require("./models/TriviaCategory");
const UserActivity = require("./models/UserActivity");
const User = require("./models/User");

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

const authMiddleware = async (req, res, next) => {
  const authorizationHeader = req.header("Authorization");
  console.log("Authorization Header:", authorizationHeader); // Log header

  if (!authorizationHeader) {
    return res.status(401).json({ message: "Unauthorized: Missing Authorization header" });
  }

  const sessionToken = authorizationHeader.replace("Bearer ", "").trim();
  console.log("Session Token:", sessionToken); // Log token

  if (!sessionToken) {
    return res.status(401).json({ message: "Unauthorized: Missing session token" });
  }

  try {
    const user = await User.findOne({ sessionToken });
    console.log("User Found:", user); // Log user data

    if (!user) {
      return res.status(401).json({ message: "Unauthorized: Invalid session token" });
    }

    req.user = user; // Attach user to request object
    next();
  } catch (err) {
    console.error("Error in authMiddleware:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};



//Categories
// Categories with keywords for each sub-category
const categories = {
  entertainment: {
    bollywood: {
      movies: ['bollywood movies', 'film', 'cinema', 'director', 'actor', 'actress', 'screenplay'],
      actors: ['bollywood actors', 'celebrity', 'star', 'actor', 'actress'],
      songs: ['bollywood songs', 'music', 'singer', 'lyrics', 'album']
    },
    tollywood: ['tollywood', 'south indian film', 'telugu movie', 'tamil cinema'],
    indianMusic: ['indian music', 'singer', 'composer', 'album', 'classical music', 'pop', 'instrumental'],
    indianTVShows: ['tv show', 'indian television', 'soap opera', 'reality show'],
    sports: {
      cricket: ['cricket', 'bat', 'ball', 'wicket', 'batsman', 'bowler', 'tournament'],
      otherSports: ['football', 'soccer', 'tennis', 'badminton', 'hockey', 'sports event']
    }
  },
  politics: {
    national: ['government', 'ministry', 'policy', 'cabinet', 'parliament', 'national law'],
    northIndian: ['north india politics', 'state government', 'chief minister', 'legislature'],
    southIndian: ['south india politics', 'andhra pradesh', 'karnataka', 'tamil nadu'],
    freedomMovement: ['independence', 'freedom fighters', 'british rule', 'indian freedom movement']
  },
  history: {
    ancientIndia: ['ancient india', 'vedic period', 'maurya empire', 'gupta dynasty', 'harappan'],
    medievalIndia: ['medieval india', 'mughal empire', 'sultanate', 'rajput', 'maratha'],
    modernIndia: ['modern india', 'british india', 'post-independence', 'partition', 'indian history']
  },
  geography: {
    statesAndCapitals: ['state capital', 'indian states', 'capital city', 'map of india'],
    riversAndMountains: ['rivers of india', 'mountains', 'himalayas', 'ganges', 'narmada'],
    nationalParks: ['national park', 'wildlife sanctuary', 'forest reserve', 'nature park'],
    librariesAndStatues: ['indian library', 'statue', 'monument', 'historical site']
  },
  generalKnowledge: {
    economy: ['indian economy', 'gdp', 'inflation', 'stock market', 'trade', 'finance'],
    festivals: ['festival', 'celebration', 'diwali', 'holi', 'eid', 'indian tradition'],
    literature: ['literature', 'books', 'author', 'poet', 'novel', 'indian writer'],
    scienceAndTechnology: ['science', 'technology', 'innovation', 'research', 'engineering']
  },
  mythology: {
    hindu: ['hindu mythology', 'god', 'goddess', 'epic', 'mahabharata', 'ramayana'],
    otherReligions: ['buddhism', 'jainism', 'sikhism', 'christianity', 'islam', 'mythology']
  },
  currentAffairs: {
    economicAffairs: ['economy', 'budget', 'policy', 'investment', 'indian market'],
    infrastructure: ['infrastructure', 'development', 'roads', 'transportation', 'urban planning'],
    internationalRelations: ['foreign policy', 'diplomacy', 'alliance', 'india-un relations'],
    healthAndEnvironment: ['health', 'environment', 'climate change', 'pollution', 'conservation']
  }
};
// Utility: Categorize Articles
function categorizeArticle(article) {
  const content = `${article.title} ${article.snippet}`.toLowerCase();

  for (let mainCategory in categories) {
    for (let subCategory in categories[mainCategory]) {
      const keywords = categories[mainCategory][subCategory];
      if (Array.isArray(keywords) && keywords.filter((keyword) => content.includes(keyword)).length >= 2) {
        return `${mainCategory}/${subCategory}`;
      }
    }
  }
  return "others";
}

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
    let triviaCategory = await Trivia.findOne({ category, domain });

    if (!triviaCategory) {
      triviaCategory = new Trivia({
        category,
        domain,
        questions: [],
      });
    }

    questions.forEach((question) => {
      const newQuestion = {
        question: question.question,
        options: question.options,
        correct_answer: question.correct_answer || question.correctAnswer,
        subDomain: question.subDomain,
      };

      triviaCategory.questions.push(newQuestion); // push as object, not string
    });

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
    const triviaCategory = await Trivia.findOne({ category, domain: subDomain });

    if (!triviaCategory || !triviaCategory.questions.length) {
      return res.status(404).json({
        status: "error",
        message: "No questions found for the specified category and subDomain.",
      });
    }

    res.json({
      status: "success",
      questions: triviaCategory.questions,
    });
  } catch (error) {
    console.log(error)
    next(error);
  }
});


// Import OpenAI service
const { generateQuestions, generateExplanation } = require('./services/openaiService');

app.get('/api/random-questions', async (req, res) => {
  const { categories } = req.query; // Comma-separated list of categories

  if (!categories) {
    return res.status(400).json({ message: 'Categories are required.' });
  }

  const categoryList = categories.split(',');

  try {
    // Find questions for the specified categories
    const questions = await Trivia.aggregate([
      { $match: { category: { $in: categoryList } } },
      { $unwind: '$questions' },
      { $sample: { size: 10 } }, // Select 10 random questions
      { $project: { _id: 0, question: '$questions' } },
    ]);

    res.json({ questions: questions.map(q => q.question) });
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
      return res.status(400).json({ 
        status: "error", 
        message: "Category is required." 
      });
    }

    const questions = await generateQuestions(category, subDomain, count);
    
    // Save to database
    let triviaCategory = await Trivia.findOne({ category, domain: subDomain });
    if (!triviaCategory) {
      triviaCategory = new Trivia({ category, domain: subDomain, questions: [] });
    }

    // Enhanced question validation and formatting
    const formattedQuestions = questions.map(q => ({
      question: q.question.trim(),
      options: q.options.map(opt => opt.trim()).filter(opt => opt.length > 0),
      correct_answer: (q.correct_answer || q.correctAnswer).trim(),
      subDomain: subDomain,
      category: category,
      aiGenerated: true,
      createdAt: new Date(),
      difficulty: q.difficulty || 'medium', // Add difficulty tracking
      validated: true
    })).filter(q => {
      // Additional quality checks
      return q.question.length > 10 && 
             q.question.length < 200 &&
             q.options.length === 4 &&
             q.options.every(opt => opt.length > 0 && opt.length < 100) &&
             q.correct_answer.length > 0 &&
             q.correct_answer.length < 100;
    });

    triviaCategory.questions.push(...formattedQuestions);
    await triviaCategory.save();

    res.json({
      status: "success",
      message: "Questions generated and saved successfully!",
      questions: formattedQuestions,
      count: formattedQuestions.length
    });
  } catch (error) {
    console.error("Error generating questions:", error);
    res.status(500).json({ 
      status: "error", 
      message: error.message 
    });
  }
});

// New endpoint for AI-generated explanations
app.post("/api/generate-explanation", authMiddleware, async (req, res, next) => {
  try {
    const { question, userAnswer, correctAnswer } = req.body;
    
    if (!question || !userAnswer || !correctAnswer) {
      return res.status(400).json({ 
        status: "error", 
        message: "Missing required fields: question, userAnswer, correctAnswer" 
      });
    }

    const explanation = await generateExplanation(question, userAnswer, correctAnswer);
    
    res.json({ 
      status: "success", 
      explanation: explanation 
    });
  } catch (error) {
    console.error('Error generating explanation:', error);
    res.status(500).json({ 
      status: "error", 
      message: "Failed to generate explanation" 
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

if (process.env.NODE_ENV !== "test") {
  mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));
}


// Routes
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

module.exports = app; // Export app for Vercel, testing
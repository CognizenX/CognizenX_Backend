const express = require("express");
const TriviaCategory = require("../models/TriviaCategory");
const {
  formatQuestion,
  formatQuestions,
  deduplicateAgainst,
  normaliseForResponse,
} = require("../utils/questionFormatter");

const router = express.Router();

// POST /api/add-questions - Add questions manually
router.post("/add-questions", async (req, res, next) => {
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

// GET /api/questions - Fetch questions by category and subDomain
router.get("/questions", async (req, res, next) => {
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
    console.log(error);
    next(error);
  }
});

// GET /api/random-questions - Get random questions (AI-generated or from bank)
router.get("/random-questions", async (req, res, next) => {
  const { categories, subDomain, useSaved = 'true' } = req.query;

  if (!categories) {
    return res.status(400).json({ message: 'Categories are required.' });
  }

  const categoryList = categories.split(',');
  // We no longer generate questions via OpenAI from this endpoint.
  // Always serve questions from the saved bank.
  const shouldUseSaved = true;

  try {
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
        // no-op
      }
    }
    
    // Use up to 10 questions from the saved bank.
    let finalQuestions = [];
    
    if (savedQuestions.length > 0) {
      finalQuestions = savedQuestions.sort(() => Math.random() - 0.5).slice(0, 10);
    }
    
    if (finalQuestions.length === 0) {
      return res.status(200).json({
        questions: [],
        totalAvailable: 0,
        generated: 0,
        message: subDomain 
          ? `No questions available for ${categoryList.join(', ')} / ${subDomain}.`
          : 'No questions available for the selected categories.'
      });
    }
    
    // Final shuffle for randomness (finalQuestions is already limited to 10)
    const shuffledFinal = finalQuestions.sort(() => Math.random() - 0.5);
    
    // Ensure backward compatibility for existing questions
    const compatibleQuestions = shuffledFinal.map(normaliseForResponse);
    
    res.json({ 
      questions: compatibleQuestions,
      totalAvailable: finalQuestions.length,
      generated: 0
    });
  } catch (error) {
    console.error('Error fetching random questions:', error);
    next(error);
  }
});

module.exports = router;

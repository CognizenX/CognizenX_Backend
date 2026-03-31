const express = require("express");
const TriviaCategory = require("../models/TriviaCategory");
const {
  formatQuestion,
  deduplicateAgainst,
  normaliseForResponse,
} = require("../utils/questionFormatter");

const router = express.Router();

// POST /api/add-questions - Add questions manually
router.post("/add-questions", async (req, res, next) => {
  console.log(req.body);

  // Accept subDomain (preferred) or the legacy domain field
  const subDomain = req.body.subDomain || req.body.domain;
  const { category, questions } = req.body;

  try {
    let triviaCategory = await TriviaCategory.findOne({ category, subDomain });

    if (!triviaCategory) {
      triviaCategory = new TriviaCategory({
        category,
        subDomain,
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
    const triviaCategory = await TriviaCategory.findOne({ category, subDomain });

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

// GET /api/random-questions - Get random questions from the saved bank
router.get("/random-questions", async (req, res, next) => {
  const { categories, subDomain } = req.query;

  if (!categories) {
    return res.status(400).json({ message: 'Categories are required.' });
  }

  const categoryList = categories.split(',');

  try {
    let savedQuestions = [];

    for (const category of categoryList) {
      const query = subDomain
        ? { category, subDomain }
        : { category };

      let triviaCategory = await TriviaCategory.findOne(query);

      // Fall back to any document for this category if the specific subDomain has no questions
      if (!triviaCategory || triviaCategory.questions.length === 0) {
        const anyCategoryQuestions = await TriviaCategory.findOne({ category });
        if (anyCategoryQuestions && anyCategoryQuestions.questions.length > 0) {
          triviaCategory = anyCategoryQuestions;
        }
      }

      if (triviaCategory && triviaCategory.questions.length > 0) {
        let categorySavedQuestions = [];
        if (subDomain) {
          categorySavedQuestions = triviaCategory.questions.filter(q => {
            const questionSubDomain = q.subDomain || triviaCategory.subDomain;
            return questionSubDomain === subDomain || triviaCategory.subDomain === subDomain;
          });
        } else {
          categorySavedQuestions = triviaCategory.questions;
        }
        savedQuestions.push(...categorySavedQuestions);
      }
    }

    if (savedQuestions.length === 0) {
      return res.status(200).json({
        questions: [],
        totalAvailable: 0,
        generated: 0,
        message: subDomain
          ? `No questions available for ${categoryList.join(', ')} / ${subDomain}.`
          : 'No questions available for the selected categories.'
      });
    }

    const finalQuestions = savedQuestions.sort(() => Math.random() - 0.5).slice(0, 10);
    const compatibleQuestions = finalQuestions.map(normaliseForResponse);

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

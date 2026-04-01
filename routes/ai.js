const express = require("express");
const TriviaCategory = require("../models/TriviaCategory");
const { formatQuestions, deduplicateAgainst, normaliseForResponse } = require("../utils/questionFormatter");
const { generateQuestions, generateExplanation } = require("../services/openaiService");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// POST /api/generate-questions - Generate questions via OpenAI
router.post("/generate-questions", authMiddleware, async (req, res, next) => {
  try {
    const { category, subDomain, count = 10 } = req.body;
    if (!category) {
      return res.status(400).json({ status: "error", message: "Category is required" });
    }
    
    const questions = await generateQuestions(category, subDomain, count);

    const questionsWithExplanations = await Promise.all(
      questions.map(async (questionObj) => {
        try {
          const explanation = await generateExplanation(
            questionObj.question,
            questionObj.correct_answer,
            questionObj.correct_answer
          );

          return {
            ...questionObj,
            explanation,
            explanationGeneratedAt: new Date(),
          };
        } catch (explanationError) {
          console.warn(
            `Failed to generate explanation for question: "${(questionObj.question || '').substring(0, 60)}..."`,
            explanationError.message
          );

          return {
            ...questionObj,
            explanation: '',
          };
        }
      })
    );
    
    let triviaCategory = await TriviaCategory.findOne({ category, domain: subDomain });
    if (!triviaCategory) {
      triviaCategory = new TriviaCategory({ category, domain: subDomain, questions: [] });
    }
    
    const formattedQuestions = formatQuestions(questionsWithExplanations, {
      category,
      subDomain,
      aiGenerated: true,
    });
    
    // Add new questions to the database (avoid duplicates by checking question text)
    const { unique, addedCount, duplicateCount } = deduplicateAgainst(
      formattedQuestions,
      triviaCategory.questions,
      '/api/ai/generate-questions'
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
    
    return next(error);
  }
});

// POST /api/generate-explanation - Generate explanation via OpenAI
router.post("/generate-explanation", authMiddleware, async (req, res, next) => {
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
    
    return next(error);
  }
});

module.exports = router;

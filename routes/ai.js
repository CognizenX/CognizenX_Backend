const express = require("express");
const TriviaCategory = require("../models/TriviaCategory");
const { formatQuestions } = require("../utils/questionFormatter");
const { ingestQuestions } = require("../services/questionIngestion");
const { generateQuestions, generateExplanation } = require("../services/openaiService");
const { normaliseTaxonomyInput, buildCategorySubDomainQuery } = require("../utils/taxonomy");
const authMiddleware = require("../middleware/auth");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

// POST /api/generate-questions - Generate questions via OpenAI (admin only)
router.post("/generate-questions", authMiddleware, requireAdmin, async (req, res, next) => {
  try {
    const { category, subDomain } = normaliseTaxonomyInput(req.body);
    const count = Number(req.body.count || 10);
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
    
    let triviaCategory = await TriviaCategory.findOne(
      buildCategorySubDomainQuery(category, subDomain)
    );
    if (!triviaCategory) {
      triviaCategory = new TriviaCategory({ category, subDomain, questions: [] });
    }
    
    const formattedQuestions = formatQuestions(questionsWithExplanations, {
      category,
      subDomain,
      aiGenerated: true,
    });
    
    const ingestResult = await ingestQuestions({
      category,
      subDomain,
      candidates: formattedQuestions,
      existingQuestions: triviaCategory.questions,
      logPrefix: '/api/generate-questions',
    });

    triviaCategory.questions.push(...ingestResult.accepted);
    await triviaCategory.save();
    console.log(
      `Generated questions: ${ingestResult.addedCount} added, ${ingestResult.exactDuplicateCount} exact duplicates, ${ingestResult.semanticDuplicateCount} semantic duplicates skipped`
    );

    res.json({
      status: "success",
      message: `Generated ${ingestResult.addedCount} questions`,
      questions: ingestResult.accepted,
      duplicates: ingestResult.duplicateCount,
      exactDuplicates: ingestResult.exactDuplicateCount,
      semanticDuplicates: ingestResult.semanticDuplicateCount,
    });
  } catch (error) {
    console.error('Error generating questions:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', req.body);
    console.error('Request user:', req.user?._id);
    
    return next(error);
  }
});

/**
 * Live-quiz users may request an explanation only for a real bank question
 * (questionId + category + subDomain). Admins may call without that constraint.
 */
// POST /api/generate-explanation
router.post("/generate-explanation", authMiddleware, async (req, res, next) => {
  try {
    const { question, userAnswer, correctAnswer, questionId } = req.body;
    const { category, subDomain } = normaliseTaxonomyInput(req.body);
    if (!question || !userAnswer || !correctAnswer) {
      return res.status(400).json({ status: "error", message: "Question, user answer, and correct answer are required" });
    }

    const isAdmin = req.user?.role === "admin";
    const hasBankLookup = Boolean(questionId && category && subDomain);

    if (!isAdmin && !hasBankLookup) {
      return res.status(403).json({
        status: "error",
        message: "Forbidden: questionId, category, and subDomain are required",
      });
    }
    
    console.log('Explanation request:', { questionId, category, subDomain, hasQuestion: !!question, isAdmin });

    let questionObj = null;
    let triviaCategory = null;

    if (hasBankLookup) {
      triviaCategory = await TriviaCategory.findOne(
        buildCategorySubDomainQuery(category, subDomain)
      );
      if (triviaCategory) {
        questionObj = triviaCategory.questions.id(questionId);
      }

      if (!isAdmin && !questionObj) {
        return res.status(403).json({
          status: "error",
          message: "Forbidden: Question not found in the question bank",
        });
      }

      if (questionObj && questionObj.explanation) {
        console.log('Returning cached explanation');
        return res.json({
          status: "success",
          explanation: questionObj.explanation,
          cached: true,
        });
      }
    }
    
    console.log('Generating new explanation via OpenAI...');
    const explanation = await generateExplanation(question, userAnswer, correctAnswer);
    console.log('Explanation generated, length:', explanation?.length);
    
    if (questionObj && triviaCategory && explanation) {
      console.log('Attempting to save explanation to database...');
      questionObj.explanation = explanation;
      questionObj.explanationGeneratedAt = new Date();
      await triviaCategory.save();
      console.log('Explanation saved successfully to database');
    } else if (!isAdmin) {
      console.log('Skipping save - question missing after generation');
    } else {
      console.log('Skipping save - admin free-form or missing bank params:', {
        questionId: !!questionId,
        category: !!category,
        subDomain: !!subDomain,
        explanation: !!explanation,
      });
    }
    
    res.json({ status: "success", explanation, cached: false });
  } catch (error) {
    console.error('Error generating explanation:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', req.body);
    console.error('Request user:', req.user?._id);
    
    return next(error);
  }
});

module.exports = router;

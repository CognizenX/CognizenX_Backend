const express = require("express");
const TriviaCategory = require("../models/TriviaCategory");
const {
  formatQuestion,
  formatQuestions,
  deduplicateAgainst,
  normaliseForResponse,
} = require("../utils/questionFormatter");
const { generateQuestions } = require("../services/openaiService");
const { runWeeklyGeneration, QUESTION_GENERATION_COUNT } = require("../services/questionScheduler");
const { categories } = require("../config/categories");

// Get email service for notifications
const { sendCronAlert } = require("../services/mailer");

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

// GET /api/random-questions - Get random questions from pre-generated bank
router.get("/random-questions", async (req, res, next) => {
  const { categories, subDomain, useSaved = 'true' } = req.query;

  if (!categories) {
    return res.status(400).json({ message: 'Categories are required.' });
  }

  const categoryList = categories.split(',');

  try {
    let savedQuestions = [];
    
    // For each category, get saved questions from the bank
    for (const category of categoryList) {
      // Determine the domain/subDomain to use
      const domainToUse = subDomain || category;
      
      // Try to get saved questions from the bank
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
    }
    
    // Check if we have any questions
    if (savedQuestions.length === 0) {
      return res.status(200).json({
        questions: [],
        totalAvailable: 0,
        message: subDomain 
          ? `No questions available for ${categoryList.join(', ')} / ${subDomain}. Please wait for weekly generation.`
          : 'No questions available for the selected categories. Please wait for weekly generation.'
      });
    }
    
    // Randomly select 10 questions from the bank
    const shuffledQuestions = savedQuestions.sort(() => Math.random() - 0.5).slice(0, 10);
    
    // Ensure backward compatibility for existing questions
    const compatibleQuestions = shuffledQuestions.map(normaliseForResponse);
    
    // Note: Activity logging is handled by frontend calling POST /api/log-activity
    console.log(`Served ${shuffledQuestions.length} questions from bank for categories: ${categoryList.join(', ')}`);
    
    res.json({ 
      questions: compatibleQuestions,
      totalAvailable: shuffledQuestions.length,
      source: 'bank'
    });
  } catch (error) {
    console.error('Error fetching random questions:', error);
    next(error);
  }
});

// POST /api/internal/generate-weekly-questions - Protected endpoint for Vercel Cron
// This endpoint is called weekly by Vercel Cron to automatically generate questions
router.post("/internal/generate-weekly-questions", async (req, res, next) => {
  try {
    // Authentication - Check Bearer token
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.CRON_SECRET;

    // Security check: Make sure CRON_SECRET is configured
    if (!expectedToken) {
      console.error('[CRON] CRON_SECRET not configured in environment variables');
      return res.status(500).json({ 
        success: false, 
        error: 'Server configuration error' 
      });
    }

    // Verify Bearer token format: "Bearer <token>"
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('[CRON] Unauthorized request - missing or invalid Authorization header');
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized - Bearer token required' 
      });
    }

    // Extract the actual token (remove "Bearer " prefix)
    const token = authHeader.substring(7); // "Bearer " is 7 characters

    // Compare provided token with expected token
    if (token !== expectedToken) {
      console.warn('[CRON] Unauthorized request - invalid token');
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized - Invalid token' 
      });
    }

    console.log('[CRON] ✅ Authentication successful');

    // Get current week number
    const { getSchedulerMetadata } = require("../services/questionScheduler");
    const metadata = await getSchedulerMetadata();
    const nextWeek = metadata.weekNumber + 1;

    console.log(`[CRON] Current week: ${metadata.weekNumber}, Next week: ${nextWeek}`);
    console.log(`[CRON] Total questions generated so far: ${metadata.totalQuestionsGenerated}`);

    // Create simple generation plan: 10 questions per category/domain
    const plan = [];
    for (const category in categories) {
      for (const domain in categories[category]) {
        plan.push({
          category,
          domain,
          questionCount: QUESTION_GENERATION_COUNT,
          tier: 'standard'
        });
      }
    }

    console.log(`[CRON] Generation plan: ${plan.length} categories to process`);
    const totalPlanned = plan.reduce((sum, p) => sum + p.questionCount, 0);
    console.log(`[CRON] Total questions to generate: ${totalPlanned} (${QUESTION_GENERATION_COUNT} per category)`);

    // Send "started" notification
    console.log('[CRON] Sending start notification...');
    await sendCronAlert('started', {
      timestamp: new Date().toISOString(),
      weekNumber: nextWeek,
      categoriesCount: plan.length,
      expectedQuestionsCount: totalPlanned
    }).catch(err => console.error('[CRON] Error sending start notification:', err));

    // Run the weekly generation
    console.log('[CRON] Starting question generation...');
    const results = await runWeeklyGeneration(plan);

    // Log results
    console.log('[CRON] ✅ Generation complete!');
    console.log(`[CRON] Status: ${results.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`[CRON] Week: ${results.weekNumber}`);
    console.log(`[CRON] Questions generated: ${results.totalQuestionsGenerated}`);
    console.log(`[CRON] Categories processed: ${results.categoriesProcessed}`);
    console.log(`[CRON] Categories with questions: ${results.categoriesWithQuestions}`);

    // Check for failures
    const failures = results.results.filter(r => !r.success);
    const failureDetails = [];
    if (failures.length > 0) {
      console.warn(`[CRON] ⚠️ ${failures.length} categories had errors:`);
      failures.forEach(f => {
        const detail = `${f.category}/${f.domain}: ${f.error}`;
        console.warn(`  - ${detail}`);
        failureDetails.push(detail);
      });
    }

    // Send "completed" notification
    console.log('[CRON] Sending completion notification...');
    await sendCronAlert('completed', {
      success: results.success,
      timestamp: new Date().toISOString(),
      weekNumber: results.weekNumber,
      totalQuestionsGenerated: results.totalQuestionsGenerated,
      categoriesProcessed: results.categoriesProcessed,
      categoriesWithQuestions: results.categoriesWithQuestions,
      failures: failures.length,
      failureDetails: failureDetails
    }).catch(err => console.error('[CRON] Error sending completion notification:', err));

    // Return response to Vercel Cron
    res.json({
      success: results.success,
      weekNumber: results.weekNumber,
      totalQuestionsGenerated: results.totalQuestionsGenerated,
      categoriesProcessed: results.categoriesProcessed,
      categoriesWithQuestions: results.categoriesWithQuestions,
      failures: failures.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[CRON] ❌ Error during weekly generation:', error);
    
    // Try to send error notification
    const { sendCronAlert } = require("../services/mailer");
    await sendCronAlert('completed', {
      success: false,
      timestamp: new Date().toISOString(),
      weekNumber: 'N/A',
      totalQuestionsGenerated: 0,
      categoriesProcessed: 0,
      categoriesWithQuestions: 0,
      failures: 1,
      failureDetails: [`Critical error: ${error.message}`]
    }).catch(err => console.error('[CRON] Error sending error notification:', err));
    
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;

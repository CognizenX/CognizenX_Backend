const express = require("express");
const TriviaCategory = require("../models/TriviaCategory");
const {
  formatQuestion,
  deduplicateAgainst,
  normaliseForResponse,
} = require("../utils/questionFormatter");
const { generateQuestions } = require("../services/openaiService");
const { runWeeklyGeneration, QUESTION_GENERATION_COUNT } = require("../services/questionScheduler");
const { categories } = require("../config/categories");
const { normalizeLegacyCategory } = require("../utils/categoryNormalizer");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCategoryQuery(category) {
  const key = String(category || "").trim().toLowerCase();

  // During the migration window, treat mythology as an alias for religion.
  if (key === "religion") {
    return { $in: ["religion", "mythology", "Religion", "Mythology"] };
  }

  // Preserve the original input but tolerate common casing.
  const raw = String(category || "").trim();
  return { $in: [raw, raw.toLowerCase(), raw.toUpperCase()] };
}

function buildSubDomainQuery(subDomain) {
  const raw = String(subDomain || "").trim();
  // Case-insensitive exact match so stored "hindu" still matches "Hindu".
  const rx = new RegExp(`^${escapeRegExp(raw)}$`, "i");

  // Legacy support: "Other Mythologies" was folded into "Sikhism".
  if (String(raw).toLowerCase() === "sikhism") {
    return {
      $in: [
        rx,
        new RegExp(`^${escapeRegExp("Other Mythologies")}$`, "i"),
      ],
    };
  }

  return rx;
}

// Get email service for notifications
const { sendCronAlert } = require("../services/mailer");

const router = express.Router();

// POST /api/add-questions - Add questions manually
router.post("/add-questions", async (req, res, next) => {
  console.log(req.body);

  // Accept subDomain (preferred) or the legacy domain field
  const subDomain = req.body.subDomain || req.body.domain;
  const { category, questions } = req.body;

  try {
    const normalized = normalizeLegacyCategory(category, subDomain);
    const nextCategory = normalized.category;
    const nextSubDomain = normalized.subDomain;

    let triviaCategory = await TriviaCategory.findOne({
      category: nextCategory,
      subDomain: nextSubDomain,
    });

    if (!triviaCategory) {
      triviaCategory = new TriviaCategory({
        category: nextCategory,
        subDomain: nextSubDomain,
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
    const normalized = normalizeLegacyCategory(category, subDomain);

    const triviaCategory = await TriviaCategory.findOne({
      category: buildCategoryQuery(normalized.category),
      subDomain: buildSubDomainQuery(normalized.subDomain),
    });

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

  const normalizedQuery = normalizeLegacyCategory(null, subDomain);
  const normalizedSubDomain = normalizedQuery.subDomain;

  function matchesSubDomain(questionSubDomain) {
    const q = String(questionSubDomain || '').trim().toLowerCase();
    const requested = String(normalizedSubDomain || '').trim().toLowerCase();

    if (!requested) return true;
    if (q === requested) return true;

    // Legacy support: "Other Mythologies" was folded into "Sikhism".
    if (requested === 'sikhism' && q === 'other mythologies') return true;
    return false;
  }

  try {
    let savedQuestions = [];
    
    // For each category, get saved questions from the bank
    for (const category of categoryList) {
      const normalized = normalizeLegacyCategory(category, normalizedSubDomain);
      const categoryQuery = {
        category: buildCategoryQuery(normalized.category),
      };

      if (normalizedSubDomain) {
        categoryQuery.subDomain = buildSubDomainQuery(normalizedSubDomain);
      }

      let triviaCategory = await TriviaCategory.findOne(categoryQuery);

      // Fall back to any document for this category if the specific subDomain has no questions
      if (!triviaCategory || triviaCategory.questions.length === 0) {
        const anyCategoryQuestions = await TriviaCategory.findOne({
          category: buildCategoryQuery(normalized.category),
        });
        if (anyCategoryQuestions && anyCategoryQuestions.questions.length > 0) {
          triviaCategory = anyCategoryQuestions;
        }
      }

      if (triviaCategory && triviaCategory.questions.length > 0) {
        let categorySavedQuestions = [];
        if (normalizedSubDomain) {
          categorySavedQuestions = triviaCategory.questions.filter(q => {
            const questionSubDomain = q.subDomain || triviaCategory.subDomain;
            return matchesSubDomain(questionSubDomain);
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
        generated: 0,
        message: normalizedSubDomain
          ? `No questions available for ${categoryList.join(', ')} / ${subDomain}.`
          : 'No questions available for the selected categories.'
      });
    }
    
    // Randomly select 10 questions from the bank
    const finalQuestions = savedQuestions.sort(() => Math.random() - 0.5).slice(0, 10);
    
    // Ensure backward compatibility for existing questions
    const compatibleQuestions = finalQuestions.map(normaliseForResponse);

    // Note: Activity logging is handled by frontend calling POST /api/log-activity
    console.log(
      `Served ${compatibleQuestions.length} questions from bank for categories: ${categoryList.join(', ')}`
    );
    
    res.json({ 
      questions: compatibleQuestions,
      totalAvailable: savedQuestions.length,
      generated: 0,
      source: 'bank',
    });
  } catch (error) {
    console.error('Error fetching random questions:', error);
    next(error);
  }
});

// GET/POST /api/internal/generate-weekly-questions - Protected endpoint for Vercel Cron
// Vercel Cron triggers this endpoint with GET. POST is also supported for manual testing.
const handleWeeklyGeneration = async (req, res, next) => {
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

    // Create generation plan:
    // 1) If any category/subDomain has 0 questions, generate only for those.
    // 2) Otherwise, run the full weekly plan as usual.
    const emptyPlan = [];
    const fullPlan = [];

    for (const category in categories) {
      for (const subDomain in categories[category]) {
        fullPlan.push({
          category,
          subDomain,
          questionCount: QUESTION_GENERATION_COUNT,
          tier: 'standard'
        });

        const existing = await TriviaCategory.findOne(
          { category, subDomain },
          { questions: 1 }
        ).lean();

        const totalQuestions = Array.isArray(existing?.questions)
          ? existing.questions.length
          : 0;

        if (totalQuestions === 0) {
          emptyPlan.push({
            category,
            subDomain,
            questionCount: QUESTION_GENERATION_COUNT,
            tier: 'empty'
          });
        }
      }
    }

    const plan = emptyPlan.length > 0 ? emptyPlan : fullPlan;

    console.log(`[CRON] Generation plan: ${plan.length} categories to process`);
    if (emptyPlan.length > 0) {
      console.log(`[CRON] Using empty-category plan (${emptyPlan.length}) instead of full plan (${fullPlan.length})`);
    }
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
        const detail = `${f.category}/${f.subDomain || 'unknown'}: ${f.error}`;
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
};

router.get("/internal/generate-weekly-questions", handleWeeklyGeneration);
router.post("/internal/generate-weekly-questions", handleWeeklyGeneration);

module.exports = router;

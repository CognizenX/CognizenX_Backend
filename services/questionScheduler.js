/**
 * Orchestrates bulk pre-generation of questions
 * 
 * Key Functions:
 * - generateQuestionsForCategory() - Generate and save questions for one category/domain
 * - runWeeklyGeneration() - Process all categories in the generation plan
 * - getSchedulerMetadata() - Track how many times scheduler has run
 * - updateSchedulerMetadata() - Increment run count
 */

const TriviaCategory = require('../models/TriviaCategory');
const SchedulerMetadata = require('../models/SchedulerMetadata');
const { generateQuestions, generateExplanation } = require('./openaiService');
const { formatQuestions, deduplicateAgainst } = require('../utils/questionFormatter');

const QUESTION_GENERATION_COUNT = 10; 

/**
 * Generate and save questions for a single category/domain
 * 
 * PARAMETERS:
 * - category: e.g. "politics"
 * - domain: e.g. "national"
 * - retries: how many times to retry on failure
 * 
 * NOTE: Uses QUESTION_GENERATION_COUNT constant
 * 
 * RETURNS:
 * {
 *   success: boolean,
 *   questionsGenerated: number,   // newly added questions
 *   duplicates: number,            // skipped duplicates
 *   error?: string
 * }
 */
async function generateQuestionsForCategory(category, domain, retries = 3) {
  let lastError;

  // Retry logic: attempt generation up to 3 times in case of API failures
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(
        `[GENERATOR] Generating ${QUESTION_GENERATION_COUNT} questions for "${category}/${domain}" (Attempt ${attempt}/${retries})`
      );

      // Call generateQuestions() from routes/ai.js
      const generatedQuestions = await generateQuestions(category, domain, QUESTION_GENERATION_COUNT);

      if (!generatedQuestions || generatedQuestions.length === 0) {
        throw new Error('OpenAI returned no questions');
      }

      console.log(
        `[GENERATOR] OpenAI returned ${generatedQuestions.length} questions for ${category}/${domain}`
      );

      const generatedQuestionsWithExplanations = await Promise.all(
        generatedQuestions.map(async (questionObj, index) => {
          // Retry explanation generation up to 3 times
          let explanation = null;
          let lastExplanationError = null;
          const maxExplanationRetries = 3;

          for (let explanationAttempt = 1; explanationAttempt <= maxExplanationRetries; explanationAttempt++) {
            try {
              explanation = await generateExplanation(
                questionObj.question,
                questionObj.correct_answer,
                questionObj.correct_answer
              );
              break; // Success, exit retry loop
            } catch (explanationError) {
              lastExplanationError = explanationError;
              if (explanationAttempt < maxExplanationRetries) {
                await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1s before retry
              }
            }
          }

          // If all retries failed, skip this question
          if (!explanation) {
            return null;
          }

          // Success - we have the question with explanation
          const questionWithExplanation = {
            ...questionObj,
            explanation,
            explanationGeneratedAt: new Date(),
          };

          return questionWithExplanation;
        })
      );

      // Filter out questions that failed explanation generation
      const validQuestions = generatedQuestionsWithExplanations.filter(q => q !== null);

      if (validQuestions.length === 0) {
        throw new Error('No valid questions with explanations after generation');
      }

      console.log(
        `\n[GENERATOR] ✅ Successfully generated ${validQuestions.length} questions with explanations (${generatedQuestions.length - validQuestions.length} skipped)\n`
      );

      // Adds metadata like subDomain, aiGenerated flag, difficulty, createdAt
      const formattedQuestions = formatQuestions(validQuestions, {
        category,
        subDomain: domain,
        aiGenerated: true,
      });

      if (formattedQuestions.length === 0) {
        throw new Error('No valid questions after formatting');
      }

      // Find or create the TriviaCategory document
      let triviaCategory = await TriviaCategory.findOne({ category, domain });

      if (!triviaCategory) {
        triviaCategory = new TriviaCategory({
          category,
          domain,
          questions: [],
        });
        console.log(`[GENERATOR] Created new category document for ${category}/${domain}`);
      }

      // Check for duplicates
      const { unique, addedCount, duplicateCount } = deduplicateAgainst(
        formattedQuestions,
        triviaCategory.questions,
        `${category}/${domain}`
      );

      // Add new questions and save to MongoDB
      triviaCategory.questions.push(...unique);
      await triviaCategory.save();

      console.log(
        `[GENERATOR] SUCCESS: Added ${addedCount} questions (${duplicateCount} duplicates skipped) for "${category}/${domain}"`
      );

      // Return success summary with the generated questions
      return {
        success: true,
        questionsGenerated: addedCount,
        duplicates: duplicateCount,
        questions: unique,  // Include the actual questions for logging/review
      };
    } catch (error) {
      lastError = error;
      console.error(
        `[GENERATOR] Attempt ${attempt} failed for "${category}/${domain}":`,
        error.message
      );

      // Wait before retrying (exponential backoff: 2s, 4s, 6s)
      if (attempt < retries) {
        const delay = 2000 * attempt;
        console.log(`[GENERATOR] Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted
  console.error(
    `[GENERATOR] FAILED after ${retries} attempts for "${category}/${domain}"`
  );
  return {
    success: false,
    questionsGenerated: 0,
    duplicates: 0,
    questions: [],  // Empty array on failure
    error: lastError?.message || 'Unknown error',
  };
}

/**
 * Get or create scheduler metadata
 * 
 * WHAT IT DOES:
 * Reads the metadata document that tracks how many times the scheduler has run
 * 
 * RETURNS:
 * {
 *   weekNumber: number,        // How many times has this run?
 *   lastRunAt: Date,
 *   totalQuestionsGenerated: number
 * }
 */
async function getSchedulerMetadata() {
  try {
    let metadata = await SchedulerMetadata.findOne({});

    if (!metadata) {
      // First run: create metadata document
      metadata = new SchedulerMetadata({
        weekNumber: 0,
        totalQuestionsGenerated: 0,
        lastRunAt: null,
      });
      await metadata.save();
      console.log('[SCHEDULER] Created new metadata document');
    }

    return metadata;
  } catch (error) {
    console.error('[SCHEDULER] Error getting metadata:', error);
    throw error;
  }
}

/**
 * Update scheduler metadata after a run
 * 
 * PARAMETERS:
 * - totalQuestionsGenerated: how many questions were added in this run
 * 
 * RETURNS:
 * Updated metadata document
 */
async function updateSchedulerMetadata(totalQuestionsGenerated = 0) {
  try {
    let metadata = await SchedulerMetadata.findOne({});

    if (!metadata) {
      metadata = new SchedulerMetadata();
    }

    // Increment week number (first run = week 1, second run = week 2, etc.)
    metadata.weekNumber = (metadata.weekNumber || 0) + 1;
    metadata.lastRunAt = new Date();
    metadata.totalQuestionsGenerated =
      (metadata.totalQuestionsGenerated || 0) + totalQuestionsGenerated;

    await metadata.save();

    console.log(`[SCHEDULER] Updated metadata - Week ${metadata.weekNumber}`);
    return metadata;
  } catch (error) {
    console.error('[SCHEDULER] Error updating metadata:', error);
    throw error;
  }
}

/**
 * Run the complete weekly generation process
 * 
 * WHAT IT DOES:
 * 1. Gets current scheduler metadata (to know the week number)
 * 2. Loops through each category in the plan
 * 3. Calls generateQuestionsForCategory() for each
 * 4. Tracks results
 * 5. Updates metadata
 * 
 * PARAMETERS:
 * - generationPlan: Array of {category, domain, questionCount, tier, ...}
 * 
 * RETURNS:
 * {
 *   success: boolean,
 *   weekNumber: number,
 *   totalQuestionsGenerated: number,
 *   categoriesProcessed: number,
 *   results: [ { category, domain, success, generated, duplicates, error? } ]
 * }
 */
async function runWeeklyGeneration(generationPlan) {
  const startTime = Date.now();

  try {
    console.log('\n' + '='.repeat(70));
    console.log('[SCHEDULER] Starting weekly generation process');
    console.log('='.repeat(70) + '\n');

    // Get current metadata
    const metadata = await getSchedulerMetadata();
    const weekNumber = metadata.weekNumber + 1;

    console.log(`[SCHEDULER] Week: ${weekNumber}`);
    console.log(`[SCHEDULER] Categories to process: ${generationPlan.length}`);
    console.log(`[SCHEDULER] Generating 10 questions per category\n`);

    const results = [];
    let totalQuestionsGenerated = 0;
    let categoriesWithQuestions = 0;

    for (const planItem of generationPlan) {
      const { category, domain, tier } = planItem;

      // Generate questions for this category (always uses QUESTION_GENERATION_COUNT)
      const result = await generateQuestionsForCategory(
        category,
        domain
      );

      results.push({
        category,
        domain,
        tier,
        ...result,
      });

      if (result.success && result.questionsGenerated > 0) {
        totalQuestionsGenerated += result.questionsGenerated;
        categoriesWithQuestions++;
      }

      // Add delay between API calls to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Update metadata to reflect this run
    await updateSchedulerMetadata(totalQuestionsGenerated);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n' + '='.repeat(70));
    console.log('[SCHEDULER] Weekly generation COMPLETED');
    console.log('='.repeat(70));
    console.log(`Duration: ${duration}s`);
    console.log(`Week: ${weekNumber}`);
    console.log(`Questions generated: ${totalQuestionsGenerated}`);
    console.log(`Categories with questions: ${categoriesWithQuestions}/${generationPlan.length}`);
    console.log('='.repeat(70) + '\n');

    return {
      success: true,
      weekNumber,
      totalQuestionsGenerated,
      categoriesProcessed: generationPlan.length,
      categoriesWithQuestions,
      results,
    };
  } catch (error) {
    console.error('[SCHEDULER] Critical error during generation:', error);
    throw error;
  }
}

module.exports = {
  generateQuestionsForCategory,
  runWeeklyGeneration,
  getSchedulerMetadata,
  updateSchedulerMetadata,
  QUESTION_GENERATION_COUNT,
};

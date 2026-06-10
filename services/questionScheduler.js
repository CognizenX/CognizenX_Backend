/**
 * Orchestrates bulk pre-generation of questions
 * 
 * Key Functions:
 * - generateQuestionsForCategory() - Generate and save questions for one category/subDomain
 * - runWeeklyGeneration() - Process all categories in the generation plan
 * - getSchedulerMetadata() - Track how many times scheduler has run
 * - updateSchedulerMetadata() - Increment run count
 */

const TriviaCategory = require('../models/TriviaCategory');
const SchedulerMetadata = require('../models/SchedulerMetadata');
const { generateQuestions, generateExplanation } = require('./openaiService');
const { formatQuestions } = require('../utils/questionFormatter');
const { ingestQuestions } = require('./questionIngestion');
const { buildCategorySubDomainQuery } = require('../utils/taxonomy');

const QUESTION_GENERATION_COUNT = 10;
const GENERATION_BATCH_SIZE = 10;

function buildAvoidTopics(existingQuestions = [], limit = 15) {
  return existingQuestions
    .map((q) => String(q.question || '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

/**
 * Generate and save questions for a single category/subDomain
 * 
 * PARAMETERS:
 * - category: e.g. "politics"
 * - subDomain: e.g. "national"
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
async function generateQuestionsForCategory(category, subDomain, options = {}) {
  const {
    questionCount = QUESTION_GENERATION_COUNT,
    retries = 3,
    avoidTopics: providedAvoidTopics = null,
  } = options;

  let lastError;
  let totalAdded = 0;
  let totalDuplicates = 0;
  let totalExactDuplicates = 0;
  let totalSemanticDuplicates = 0;
  const allAccepted = [];

  let triviaCategory = await TriviaCategory.findOne(
    buildCategorySubDomainQuery(category, subDomain)
  );

  if (!triviaCategory) {
    triviaCategory = new TriviaCategory({
      category,
      subDomain,
      questions: [],
    });
    console.log(`[GENERATOR] Created new category document for ${category}/${subDomain}`);
  }

  let remaining = questionCount;
  let batchNumber = 0;

  while (remaining > 0 && batchNumber < 10) {
    batchNumber += 1;
    const batchSize = Math.min(remaining, GENERATION_BATCH_SIZE);
    const avoidTopics = providedAvoidTopics || buildAvoidTopics(triviaCategory.questions);

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(
          `[GENERATOR] Generating ${batchSize} questions for "${category}/${subDomain}" (batch ${batchNumber}, attempt ${attempt}/${retries})`
        );

        const generatedQuestions = await generateQuestions(category, subDomain, batchSize, {
          avoidTopics,
        });

        if (!generatedQuestions || generatedQuestions.length === 0) {
          throw new Error('OpenAI returned no questions');
        }

        const generatedQuestionsWithExplanations = await Promise.all(
          generatedQuestions.map(async (questionObj) => {
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

        const formattedQuestions = formatQuestions(validQuestions, {
          category,
          subDomain,
          aiGenerated: true,
        });

        if (formattedQuestions.length === 0) {
          throw new Error('No valid questions after formatting');
        }

        const ingestResult = await ingestQuestions({
          category,
          subDomain,
          candidates: formattedQuestions,
          existingQuestions: triviaCategory.questions,
          logPrefix: `${category}/${subDomain}`,
        });

        triviaCategory.questions.push(...ingestResult.accepted);
        await triviaCategory.save();

        totalAdded += ingestResult.addedCount;
        totalDuplicates += ingestResult.duplicateCount;
        totalExactDuplicates += ingestResult.exactDuplicateCount;
        totalSemanticDuplicates += ingestResult.semanticDuplicateCount;
        allAccepted.push(...ingestResult.accepted);
        remaining = Math.max(0, questionCount - totalAdded);

        console.log(
          `[GENERATOR] Batch added ${ingestResult.addedCount} (${ingestResult.exactDuplicateCount} exact, ${ingestResult.semanticDuplicateCount} semantic duplicates skipped) for "${category}/${subDomain}"`
        );

        if (ingestResult.addedCount === 0) {
          break;
        }

        break;
      } catch (error) {
        lastError = error;
        console.error(
          `[GENERATOR] Attempt ${attempt} failed for "${category}/${subDomain}":`,
          error.message
        );

        if (attempt < retries) {
          const delay = 2000 * attempt;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    if (totalAdded === 0) {
      break;
    }

    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  if (totalAdded > 0) {
    return {
      success: true,
      questionsGenerated: totalAdded,
      duplicates: totalDuplicates,
      exactDuplicates: totalExactDuplicates,
      semanticDuplicates: totalSemanticDuplicates,
      questions: allAccepted,
    };
  }

  console.error(`[GENERATOR] FAILED for "${category}/${subDomain}"`);
  return {
    success: false,
    questionsGenerated: 0,
    duplicates: 0,
    questions: [],
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
    let metadata = await SchedulerMetadata.findOne({ metadataType: "global" });

    if (!metadata) {
      // First run: create metadata document
      metadata = new SchedulerMetadata({
        metadataType: "global",
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
    let metadata = await SchedulerMetadata.findOne({ metadataType: "global" });

    if (!metadata) {
      metadata = new SchedulerMetadata({ metadataType: "global" });
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
 * - generationPlan: Array of {category, subDomain, questionCount, tier, ...}
 *   (Legacy input supports `domain` as an alias for `subDomain`.)
 * 
 * RETURNS:
 * {
 *   success: boolean,
 *   weekNumber: number,
 *   totalQuestionsGenerated: number,
 *   categoriesProcessed: number,
 *   results: [ { category, subDomain, success, generated, duplicates, error? } ]
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
    const totalPlanned = generationPlan.reduce((sum, item) => sum + (item.questionCount || QUESTION_GENERATION_COUNT), 0);
    console.log(`[SCHEDULER] Planned questions this run: ${totalPlanned}\n`);

    const results = [];
    let totalQuestionsGenerated = 0;
    let categoriesWithQuestions = 0;

    for (const planItem of generationPlan) {
      const {
        category,
        subDomain,
        domain: legacyDomain,
        tier,
        questionCount = QUESTION_GENERATION_COUNT,
        cronRunId,
      } = planItem;
      const resolvedSubDomain = subDomain || legacyDomain;

      if (!resolvedSubDomain) {
        results.push({
          category,
          subDomain: null,
          tier,
          success: false,
          questionsGenerated: 0,
          duplicates: 0,
          questions: [],
          error: 'Missing subDomain in generation plan item',
        });
        continue;
      }

      const result = await generateQuestionsForCategory(category, resolvedSubDomain, {
        questionCount,
      });

      if (cronRunId && result.success) {
        const { markSnapshotFulfilled } = require('./generationPlan');
        await markSnapshotFulfilled({
          category,
          subDomain: resolvedSubDomain,
          cronRunId,
          questionsGenerated: result.questionsGenerated,
        }).catch((err) => console.error('[SCHEDULER] snapshot update failed:', err.message));
      }

      results.push({
        category,
        subDomain: resolvedSubDomain,
        tier,
        questionCount,
        cronRunId,
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

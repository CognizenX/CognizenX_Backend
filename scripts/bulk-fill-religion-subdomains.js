#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Bulk-fill non-Hindu religion subdomains to a target count with semantic dedup.
 *
 * Usage:
 *   node scripts/bulk-fill-religion-subdomains.js --dry-run
 *   node scripts/bulk-fill-religion-subdomains.js --confirm
 *   node scripts/bulk-fill-religion-subdomains.js --confirm --subDomain=Islam
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const TriviaCategory = require('../models/TriviaCategory');
const { generateQuestions, generateExplanation } = require('../services/openaiService');
const { ingestQuestions } = require('../services/questionIngestion');
const { buildCategorySubDomainQuery } = require('../utils/taxonomy');

const CATEGORY = 'religion';
const TARGET_SUBDOMAINS = ['Buddhism', 'Christianity', 'Islam', 'Jainism', 'Sikhism'];
const TARGET_COUNT = 100;
const BATCH_SIZE = 10;
const MAX_BATCH_ATTEMPTS = 80;
const BATCH_DELAY_MS = 2000;

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--confirm');
const subDomainArg = args.find((a) => a.startsWith('--subDomain='));
const selectedSubDomain = subDomainArg ? subDomainArg.split('=')[1] : null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureReportsDir() {
  const dir = path.join(__dirname, '..', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function addExplanations(questions) {
  const enriched = [];

  for (const questionObj of questions) {
    let explanation = '';
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        explanation = await generateExplanation(
          questionObj.question,
          questionObj.correct_answer,
          questionObj.correct_answer
        );
        break;
      } catch (error) {
        if (attempt === 3) {
          console.warn(`[BULK] Explanation failed: ${error.message}`);
        } else {
          await sleep(1000);
        }
      }
    }

    if (!explanation) {
      continue;
    }

    enriched.push({
      ...questionObj,
      explanation,
      explanationGeneratedAt: new Date(),
      aiGenerated: true,
    });
  }

  return enriched;
}

async function fillSubDomain(subDomain) {
  const report = {
    category: CATEGORY,
    subDomain,
    targetCount: TARGET_COUNT,
    startedCount: 0,
    added: 0,
    exactDuplicates: 0,
    semanticDuplicates: 0,
    batchAttempts: 0,
    finalCount: 0,
    dryRun: DRY_RUN,
    errors: [],
  };

  let triviaCategory = await TriviaCategory.findOne(
    buildCategorySubDomainQuery(CATEGORY, subDomain)
  );

  if (!triviaCategory) {
    if (DRY_RUN) {
      triviaCategory = { category: CATEGORY, subDomain, questions: [] };
    } else {
      triviaCategory = new TriviaCategory({
        category: CATEGORY,
        subDomain,
        questions: [],
      });
    }
  }

  report.startedCount = triviaCategory.questions.length;
  const avoidTopics = [];

  while (
    triviaCategory.questions.length < TARGET_COUNT &&
    report.batchAttempts < MAX_BATCH_ATTEMPTS
  ) {
    report.batchAttempts += 1;
    const remaining = TARGET_COUNT - triviaCategory.questions.length;
    const batchCount = Math.min(BATCH_SIZE, remaining);

    console.log(
      `[BULK] ${subDomain}: attempt ${report.batchAttempts}, current=${triviaCategory.questions.length}, generating=${batchCount}`
    );

    try {
      const generated = await generateQuestions(CATEGORY, subDomain, batchCount, {
        avoidTopics: avoidTopics.slice(-8),
      });

      const withExplanations = await addExplanations(generated);
      const ingestResult = await ingestQuestions({
        category: CATEGORY,
        subDomain,
        candidates: withExplanations,
        existingQuestions: triviaCategory.questions,
        logPrefix: `bulk/${subDomain}`,
      });

      report.added += ingestResult.addedCount;
      report.exactDuplicates += ingestResult.exactDuplicateCount;
      report.semanticDuplicates += ingestResult.semanticDuplicateCount;
      avoidTopics.push(...ingestResult.rejectedSamples);

      if (ingestResult.addedCount > 0) {
        if (!DRY_RUN) {
          triviaCategory.questions.push(...ingestResult.accepted);
          await triviaCategory.save();
        } else {
          triviaCategory.questions.push(...ingestResult.accepted);
        }
      }

      console.log(
        `[BULK] ${subDomain}: batch accepted=${ingestResult.addedCount}, exactDup=${ingestResult.exactDuplicateCount}, semanticDup=${ingestResult.semanticDuplicateCount}`
      );
    } catch (error) {
      report.errors.push(error.message);
      console.error(`[BULK] ${subDomain}: batch error: ${error.message}`);
      if (/quota|rate limit|401|invalid api key|authentication|OPENAI_AUTH/i.test(error.message)) {
        report.authFailure = true;
        break;
      }
    }

    await sleep(BATCH_DELAY_MS);
  }

  report.finalCount = triviaCategory.questions.length;
  return report;
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGO_URL;
  if (!uri) {
    throw new Error('MONGO_URI not set');
  }

  const targets = selectedSubDomain
    ? TARGET_SUBDOMAINS.filter((s) => s.toLowerCase() === selectedSubDomain.toLowerCase())
    : TARGET_SUBDOMAINS;

  if (targets.length === 0) {
    throw new Error(`Unknown subDomain: ${selectedSubDomain}`);
  }

  console.log(`Bulk religion fill ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'}`);
  console.log(`Targets: ${targets.join(', ')} -> ${TARGET_COUNT} each`);

  await mongoose.connect(uri);

  const results = [];
  for (const subDomain of targets) {
    const result = await fillSubDomain(subDomain);
    results.push(result);
    if (result.authFailure) {
      console.error('[BULK] Stopping early due to OpenAI authentication failure.');
      break;
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(
    ensureReportsDir(),
    `bulk-generation-${timestamp}.json`
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)
  );

  console.log('\n=== Bulk Generation Summary ===');
  for (const result of results) {
    console.log(
      `${result.subDomain}: ${result.startedCount} -> ${result.finalCount} (+${result.added}, semanticDup=${result.semanticDuplicates})`
    );
  }
  console.log(`Report: ${reportPath}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('[BULK] Failed:', error.message);
  try {
    await mongoose.disconnect();
  } catch (disconnectError) {
    console.error(disconnectError.message);
  }
  process.exit(1);
});

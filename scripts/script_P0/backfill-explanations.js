/**
 * P0.4 — Fill questions whose explanation is missing or blank.
 *
 *   node scripts/script_P0/backfill-explanations.js
 *   node scripts/script_P0/backfill-explanations.js --limit 5
 *
 * Resumable: each run only selects questions that are still empty.
 * Writes explanation + explanationGeneratedAt on the nested question.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const TriviaCategory = require("../../models/TriviaCategory");
const { generateExplanation } = require("../../services/openaiService");

const INPUT_USD_PER_TOKEN = 30 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 60 / 1_000_000;

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value == null ? fallback : value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimit(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.status === 429 || message.includes("rate limit") || message.includes("429");
}

async function explainWithRetry(questionText, answer, attempts) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await generateExplanation(questionText, answer, answer, { includeUsage: true });
    } catch (error) {
      lastError = error;
      const waitMs = isRateLimit(error) ? 20000 * attempt : 1000 * attempt;
      if (attempt < attempts) {
        await sleep(waitMs);
      }
    }
  }
  throw lastError;
}

async function loadTargets(limit) {
  const docs = await TriviaCategory.find({}, { category: 1, subDomain: 1, questions: 1 }).lean();
  const targets = [];
  for (const doc of docs) {
    for (const question of doc.questions || []) {
      const explanation = String(question.explanation || "").trim();
      if (explanation) continue;
      const answer = String(question.correct_answer || question.correctAnswer || "").trim();
      targets.push({
        categoryId: doc._id,
        category: doc.category,
        subDomain: doc.subDomain,
        questionId: question._id,
        question: question.question,
        answer,
        aiGenerated: Boolean(question.aiGenerated),
      });
      if (limit && targets.length >= limit) return targets;
    }
  }
  return targets;
}

async function main() {
  const limit = Number(argValue("--limit", "0")) || 0;
  const concurrency = Math.max(1, Number(argValue("--concurrency", "3")) || 3);
  const attempts = Math.max(1, Number(argValue("--attempts", "4")) || 4);

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const targets = await loadTargets(limit);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportDir = path.join(__dirname, "..", "..", "reports", "Reports_p0");
  fs.mkdirSync(reportDir, { recursive: true });
  const logPath = path.join(reportDir, `explanation-backfill-${stamp}.jsonl`);
  const summaryPath = path.join(reportDir, `explanation-backfill-${stamp}.summary.json`);

  const stats = {
    startedAt: new Date().toISOString(),
    selected: targets.length,
    written: 0,
    skippedNoAnswer: 0,
    failed: 0,
    inputTokens: 0,
    outputTokens: 0,
    logPath,
  };

  console.log(`[backfill] selected ${targets.length} empty explanations`);
  console.log(`[backfill] log ${logPath}`);

  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const target = targets[cursor];
      cursor += 1;
      if (!target.answer || !String(target.question || "").trim()) {
        stats.skippedNoAnswer += 1;
        fs.appendFileSync(logPath, `${JSON.stringify({ status: "skipped", reason: "missing_answer_or_question", questionId: String(target.questionId), category: target.category, subDomain: target.subDomain })}\n`);
        continue;
      }

      try {
        const result = await explainWithRetry(target.question, target.answer, attempts);
        const explanation = String(result.explanation || "").trim();
        if (!explanation) {
          throw new Error("empty explanation");
        }

        const updated = await TriviaCategory.updateOne(
          { _id: target.categoryId, "questions._id": target.questionId },
          {
            $set: {
              "questions.$.explanation": explanation,
              "questions.$.explanationGeneratedAt": new Date(),
            },
          }
        );

        if (!updated.modifiedCount) {
          throw new Error("question row was not updated");
        }

        const inputTokens = Number(result.usage?.prompt_tokens || 0);
        const outputTokens = Number(result.usage?.completion_tokens || 0);
        stats.written += 1;
        stats.inputTokens += inputTokens;
        stats.outputTokens += outputTokens;
        fs.appendFileSync(logPath, `${JSON.stringify({
          status: "written",
          questionId: String(target.questionId),
          category: target.category,
          subDomain: target.subDomain,
          aiGenerated: target.aiGenerated,
          inputTokens,
          outputTokens,
        })}\n`);

        if (stats.written % 25 === 0 || stats.written === targets.length) {
          console.log(`[backfill] written ${stats.written}/${targets.length} failed ${stats.failed} tokens in ${stats.inputTokens} out ${stats.outputTokens}`);
        }
      } catch (error) {
        stats.failed += 1;
        fs.appendFileSync(logPath, `${JSON.stringify({
          status: "failed",
          questionId: String(target.questionId),
          category: target.category,
          subDomain: target.subDomain,
          error: error?.message || String(error),
        })}\n`);
        console.warn(`[backfill] failed ${target.category}/${target.subDomain} ${target.questionId}: ${error?.message || error}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(targets.length, 1)) }, () => worker()));

  stats.finishedAt = new Date().toISOString();
  stats.estimatedUsd = Number((
    stats.inputTokens * INPUT_USD_PER_TOKEN +
    stats.outputTokens * OUTPUT_USD_PER_TOKEN
  ).toFixed(4));
  fs.writeFileSync(summaryPath, JSON.stringify(stats, null, 2));
  console.log(`[backfill] done written=${stats.written} failed=${stats.failed} skipped=${stats.skippedNoAnswer} usd~${stats.estimatedUsd}`);
  console.log(`[backfill] summary ${summaryPath}`);

  await mongoose.disconnect();
  if (stats.failed > 0) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error("[backfill] fatal:", error?.message || error);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});

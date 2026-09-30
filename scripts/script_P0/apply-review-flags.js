/**
 * Write P0.5 review flags from a verify-sample report. Does not delete questions.
 *
 *   node scripts/script_P0/apply-review-flags.js reports/Reports_p0/bank-verify-sample-....json
 *
 * A concern is withheld from quizzes only when the marked answer was judged wrong
 * and confidence is at least 0.7. Other concerns stay servable and flagged.
 */
require("dotenv").config();
const fs = require("fs");
const mongoose = require("mongoose");

const CONFIDENCE_TO_WITHHOLD = 0.7;

async function main() {
  const reportPath = process.argv[2];
  if (!reportPath) throw new Error("Pass the verify-sample JSON path");
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const concerns = report.summary?.concerns || report.concerns || [];
  await mongoose.connect(process.env.MONGO_URI);
  const collection = mongoose.connection.collection("triviacategories");
  const reviewedAt = new Date();
  const applied = [];

  for (const concern of concerns) {
    const verdict = concern.verdict || {};
    const confidence = Number(verdict.confidence);
    const flags = Array.isArray(verdict.flags) ? verdict.flags.filter((flag) => flag && flag !== "none") : [];
    if (verdict.marked_answer_correct === false && !flags.includes("wrong_key")) flags.push("wrong_key");
    if (verdict.explanation_supports_answer === false && !flags.includes("bad_explanation")) flags.push("bad_explanation");
    const excludeFromQuiz = verdict.marked_answer_correct === false && confidence >= CONFIDENCE_TO_WITHHOLD;

    const questionId = new mongoose.Types.ObjectId(concern.questionId);
    const result = await collection.updateOne(
      { "questions._id": questionId },
      {
        $set: {
          "questions.$.reviewStatus": "flagged",
          "questions.$.reviewFlags": flags,
          "questions.$.reviewConfidence": Number.isFinite(confidence) ? confidence : null,
          "questions.$.reviewReason": String(verdict.reason || "").slice(0, 500),
          "questions.$.reviewExcludeFromQuiz": excludeFromQuiz,
          "questions.$.reviewModel": report.summary?.model || "gpt-4o",
          "questions.$.reviewedAt": reviewedAt,
        },
      }
    );

    applied.push({
      questionId: concern.questionId,
      category: concern.category,
      subDomain: concern.subDomain,
      excludeFromQuiz,
      flags,
      confidence,
      matched: result.matchedCount,
      modified: result.modifiedCount,
    });
  }

  const withheld = applied.filter((row) => row.excludeFromQuiz && row.modified);
  const flaggedOnly = applied.filter((row) => !row.excludeFromQuiz && row.modified);
  const missed = applied.filter((row) => !row.matched);

  const concernIds = new Set(concerns.map((concern) => concern.questionId));
  const docs = await collection.find(
    { "questions.reviewStatus": "flagged" },
    { projection: { "questions._id": 1, "questions.reviewStatus": 1 } }
  ).toArray();
  const cleared = [];
  for (const doc of docs) {
    for (const question of doc.questions || []) {
      if (question.reviewStatus !== "flagged") continue;
      const id = String(question._id);
      if (concernIds.has(id)) continue;
      const result = await collection.updateOne(
        { "questions._id": question._id },
        {
          $unset: {
            "questions.$.reviewStatus": "",
            "questions.$.reviewFlags": "",
            "questions.$.reviewConfidence": "",
            "questions.$.reviewReason": "",
            "questions.$.reviewExcludeFromQuiz": "",
            "questions.$.reviewModel": "",
            "questions.$.reviewedAt": "",
          },
        }
      );
      if (result.modifiedCount) cleared.push(id);
    }
  }

  console.log(JSON.stringify({
    reportPath,
    concerns: concerns.length,
    withheld: withheld.length,
    flaggedServable: flaggedOnly.length,
    clearedStale: cleared,
    missed: missed.map((row) => row.questionId),
  }, null, 2));

  await mongoose.disconnect();
  if (missed.length) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error?.message || error);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});

const express = require("express");
const Joi = require("joi");
const mongoose = require("mongoose");

const authMiddleware = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { normalizeLegacyCategory } = require("../utils/categoryNormalizer");

const TriviaCategory = require("../models/TriviaCategory");
const TriviaAttempt = require("../models/TriviaAttempt");
const UserQuestionStats = require("../models/UserQuestionStats");
const SchedulerMetadata = require("../models/SchedulerMetadata");

const router = express.Router();

// Fraction of a category's questions that must have been seen before
// the scheduler is triggered to generate new questions (80%).
const SEEN_THRESHOLD = 0.8;

const attemptSchema = Joi.object({
  questionId: Joi.string().required(),
  selectedAnswer: Joi.string().min(1).max(500).required(),
  timeTakenMs: Joi.number().integer().min(0).max(10 * 60 * 1000).required(),
});

const metricsQuerySchema = Joi.object({
  days: Joi.number().integer().min(1).max(365).default(14),
  category: Joi.string().min(1).max(200).optional(),
  subDomain: Joi.string().min(1).max(200).optional(),
});

function normaliseAnswer(answer) {
  return String(answer || "").trim();
}

function addDaysUTC(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// Returns the ISO week number (1–53) for a given date.
function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// POST /api/trivia/attempts
router.post("/attempts", authMiddleware, validate(attemptSchema), async (req, res, next) => {
  try {
    const { questionId, selectedAnswer, timeTakenMs } = req.body;

    if (!mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({ message: "Validation error", details: [{ field: "questionId", message: "Invalid questionId" }] });
    }

    const qid = new mongoose.Types.ObjectId(questionId);

    const triviaDoc = await TriviaCategory.findOne(
      { "questions._id": qid },
      { category: 1, subDomain: 1, "questions.$": 1 }
    );

    if (!triviaDoc || !Array.isArray(triviaDoc.questions) || triviaDoc.questions.length === 0) {
      return res.status(404).json({ message: "Question not found" });
    }

    // Normalize legacy category/subDomain values
    const normalized = normalizeLegacyCategory(triviaDoc.category, triviaDoc.subDomain);
    const normalizedCategory = normalized.category;
    const normalizedSubDomain = normalized.subDomain;

    const question = triviaDoc.questions[0];
    const correctAnswer = normaliseAnswer(question.correctAnswer || question.correct_answer);

    if (!correctAnswer) {
      return res.status(422).json({ message: "Question has no correct answer" });
    }

    const selected = normaliseAnswer(selectedAnswer);
    const isCorrect = selected.toLowerCase() === correctAnswer.toLowerCase();
    const now = new Date();

    const attempt = await TriviaAttempt.create({
      userId: req.user._id,
      questionId: qid,
      category: normalizedCategory,
      subDomain: normalizedSubDomain,
      selectedAnswer: selected,
      isCorrect,
      timeTakenMs,
      attemptedAt: now,
    });

    // ── Side effects: update aggregated stats ──────────────────────────────
    // These run after the attempt is recorded. Errors here are logged but do
    // not fail the request — the attempt is already safely stored.
    try {
      await updateUserQuestionStats({
        userId: req.user._id,
        questionId: qid,
        category: normalizedCategory,
        subDomain: normalizedSubDomain,
        isCorrect,
        timeTakenMs,
        now,
      });

      await updateSeenAndMaybeSchedule({
        questionId: qid,
        category: normalizedCategory,
        subDomain: normalizedSubDomain,
        userId: req.user._id,
        now,
      });
    } catch (sideEffectErr) {
      console.error("[trivia/attempts] side-effect error:", sideEffectErr);
    }
    // ──────────────────────────────────────────────────────────────────────

    return res.status(201).json({
      status: "success",
      attemptId: attempt._id,
      isCorrect,
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * Upserts the per-user per-question stats document.
 * Step 1: atomic $inc of counters + $push of history entry.
 * Step 2: update streak and rolling average based on the returned document.
 */
async function updateUserQuestionStats({ userId, questionId, category, subDomain, isCorrect, timeTakenMs, now }) {
  const historyEntry = { attemptedAt: now, isCorrect, timeTakenMs };

  // Step 1 — atomic upsert of counters, timestamps, and history
  const stats = await UserQuestionStats.findOneAndUpdate(
    { userId, questionId },
    {
      $inc: {
        attemptCount: 1,
        correctCount: isCorrect ? 1 : 0,
        incorrectCount: isCorrect ? 0 : 1,
      },
      $push: { attemptHistory: historyEntry },
      $set: {
        lastAttemptedAt: now,
        category,
        subDomain,
        lastResultCorrect: isCorrect,
      },
      $setOnInsert: { firstAttemptedAt: now },
    },
    { upsert: true, new: true }
  );

  // Step 2 — update streak and rolling average
  // After `new: true`, stats.attemptCount is already the incremented value.
  // stats.currentWrongStreak was NOT touched in step 1, so it holds the pre-update value.
  const newCurrentWrongStreak = isCorrect ? 0 : stats.currentWrongStreak + 1;
  const newMaxWrongStreak = Math.max(stats.maxWrongStreak, newCurrentWrongStreak);

  // Rolling average: ((oldAvg * (newCount - 1)) + newValue) / newCount
  const newAvg = stats.attemptCount === 1
    ? timeTakenMs
    : Math.round(((stats.avgTimeTakenMs * (stats.attemptCount - 1)) + timeTakenMs) / stats.attemptCount);

  await UserQuestionStats.updateOne(
    { _id: stats._id },
    {
      $set: {
        currentWrongStreak: newCurrentWrongStreak,
        maxWrongStreak: newMaxWrongStreak,
        avgTimeTakenMs: newAvg,
      },
    }
  );
}

/**
 * If this is the first time any user has answered this question,
 * increments triviacategories.seen for that category document.
 * Then checks the seen ratio; if >= SEEN_THRESHOLD, upserts a
 * SchedulerMetadata record to signal that new questions are needed.
 */
async function updateSeenAndMaybeSchedule({ questionId, category, subDomain, userId, now }) {
  // Only increment seen the first time the question is globally seen.
  const updated = await TriviaCategory.updateOne(
    {
      questions: {
        $elemMatch: {
          _id: questionId,
          seenGlobally: { $ne: true },
        },
      },
    },
    {
      $inc: { seen: 1 },
      $set: { "questions.$[q].seenGlobally": true },
    },
    {
      arrayFilters: [{ "q._id": questionId }],
    }
  );

  if (!updated.modifiedCount) return;

  // Re-fetch to get the updated seen count and total question count
  const updatedCategory = await TriviaCategory.findOne(
    { "questions._id": questionId },
    { seen: 1, questions: 1 }
  );

  if (!updatedCategory) return;

  const total = updatedCategory.questions.length;
  if (total === 0) return;

  const seenRatio = updatedCategory.seen / total;
  if (seenRatio < SEEN_THRESHOLD) return;

  // Seen ratio has crossed the threshold — record a scheduler trigger
  const weekNumber = getISOWeekNumber(now);
  await SchedulerMetadata.findOneAndUpdate(
    { category, subDomain, weekNumber },
    {
      $set: { lastRunAt: now },
      $setOnInsert: { createdAt: now, totalQuestionsGenerated: 0 },
    },
    { upsert: true }
  );
}

// GET /api/trivia/metrics/daily
router.get("/metrics/daily", authMiddleware, validate(metricsQuerySchema, "query"), async (req, res, next) => {
  try {
    const { days, category, subDomain } = req.query;

    // Normalize legacy category/subDomain query parameters
    const normalized = normalizeLegacyCategory(category, subDomain);
    const normalizedCategory = normalized.category;
    const normalizedSubDomain = normalized.subDomain;

    const now = new Date();
    const start = addDaysUTC(now, -Number(days) + 1);
    start.setUTCHours(0, 0, 0, 0);

    const match = {
      userId: req.user._id,
      attemptedAt: { $gte: start },
    };

    if (normalizedCategory) match.category = normalizedCategory;
    if (normalizedSubDomain) match.subDomain = normalizedSubDomain;

    const rows = await TriviaAttempt.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$attemptedAt", timezone: "UTC" },
          },
          totalAttempts: { $sum: 1 },
          correctCount: { $sum: { $cond: ["$isCorrect", 1, 0] } },
          incorrectCount: { $sum: { $cond: ["$isCorrect", 0, 1] } },
          avgTimeTakenMs: { $avg: "$timeTakenMs" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const series = rows.map((r) => ({
      date: r._id,
      totalAttempts: r.totalAttempts,
      correctCount: r.correctCount,
      incorrectCount: r.incorrectCount,
      avgTimeTakenMs: r.avgTimeTakenMs != null ? Math.round(r.avgTimeTakenMs) : null,
    }));

    return res.json({
      status: "success",
      days: Number(days),
      series,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

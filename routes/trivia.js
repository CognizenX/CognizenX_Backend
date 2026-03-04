const express = require("express");
const Joi = require("joi");
const mongoose = require("mongoose");

const authMiddleware = require("../middleware/auth");
const { validate } = require("../middleware/validate");

const TriviaCategory = require("../models/TriviaCategory");
const TriviaAttempt = require("../models/TriviaAttempt");

const router = express.Router();

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

function toDayStringUTC(date) {
  const d = new Date(date);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysUTC(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
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
      { category: 1, domain: 1, "questions.$": 1 }
    );

    if (!triviaDoc || !Array.isArray(triviaDoc.questions) || triviaDoc.questions.length === 0) {
      return res.status(404).json({ message: "Question not found" });
    }

    const question = triviaDoc.questions[0];
    const correctAnswer = normaliseAnswer(question.correctAnswer || question.correct_answer);

    if (!correctAnswer) {
      return res.status(422).json({ message: "Question has no correct answer" });
    }

    const selected = normaliseAnswer(selectedAnswer);
    const isCorrect = selected.toLowerCase() === correctAnswer.toLowerCase();

    const attempt = await TriviaAttempt.create({
      userId: req.user._id,
      questionId: qid,
      category: triviaDoc.category,
      subDomain: triviaDoc.domain,
      selectedAnswer: selected,
      isCorrect,
      timeTakenMs,
      attemptedAt: new Date(),
    });

    return res.status(201).json({
      status: "success",
      attemptId: attempt._id,
      isCorrect,
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/trivia/metrics/daily
router.get("/metrics/daily", authMiddleware, validate(metricsQuerySchema, "query"), async (req, res, next) => {
  try {
    const { days, category, subDomain } = req.query;

    const now = new Date();
    const start = addDaysUTC(now, -Number(days) + 1);
    start.setUTCHours(0, 0, 0, 0);

    const match = {
      userId: req.user._id,
      attemptedAt: { $gte: start },
    };

    if (category) match.category = category;
    if (subDomain) match.subDomain = subDomain;

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

const express = require("express");
const Joi = require("joi");

const authMiddleware = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const GameSession = require("../models/GameSession");

const router = express.Router();

const sessionSchema = Joi.object({
  gameId: Joi.string().min(1).max(100).required(),
  cognitiveDomains: Joi.array().items(Joi.string().max(50)).default([]),
  difficulty: Joi.string().valid("easy", "standard").default("easy"),
  startedAt: Joi.date().iso().required(),
  completedAt: Joi.date().iso().allow(null).optional(),
  durationMs: Joi.number().integer().min(0).max(4 * 60 * 60 * 1000).default(0),
  score: Joi.number().integer().min(0).default(0),
  moves: Joi.number().integer().min(0).default(0),
  completed: Joi.boolean().default(false),
  metrics: Joi.object().unknown(true).default({}),
});

const metricsQuerySchema = Joi.object({
  days: Joi.number().integer().min(1).max(365).default(14),
});

function addDaysUTC(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toDayStringUTC(date) {
  const d = new Date(date);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildDailySeries(days, rawSeries) {
  const byDate = new Map((rawSeries || []).map((row) => [row.date, row]));
  const now = new Date();
  const start = addDaysUTC(now, -days + 1);
  start.setUTCHours(0, 0, 0, 0);

  const filled = [];
  for (let i = 0; i < days; i += 1) {
    const day = addDaysUTC(start, i);
    const key = toDayStringUTC(day);
    const existing = byDate.get(key);
    filled.push(
      existing || {
        date: key,
        totalSessions: 0,
        completedSessions: 0,
        totalDurationMs: 0,
        totalScore: 0,
      }
    );
  }
  return filled;
}

// POST /api/games/sessions
router.post("/sessions", authMiddleware, validate(sessionSchema), async (req, res, next) => {
  try {
    const {
      gameId,
      cognitiveDomains,
      difficulty,
      startedAt,
      completedAt,
      durationMs,
      score,
      moves,
      completed,
      metrics,
    } = req.body;

    const session = await GameSession.create({
      userId: req.user._id,
      gameId,
      cognitiveDomains,
      difficulty,
      startedAt,
      completedAt: completedAt || null,
      durationMs,
      score,
      moves,
      completed,
      metrics,
    });

    return res.status(201).json({
      status: "success",
      sessionId: session._id,
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/games/metrics/daily
router.get("/metrics/daily", authMiddleware, validate(metricsQuerySchema, "query"), async (req, res, next) => {
  try {
    const { days } = req.query;

    const now = new Date();
    const start = addDaysUTC(now, -Number(days) + 1);
    start.setUTCHours(0, 0, 0, 0);

    const rows = await GameSession.aggregate([
      {
        $match: {
          userId: req.user._id,
          startedAt: { $gte: start },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$startedAt", timezone: "UTC" },
          },
          totalSessions: { $sum: 1 },
          completedSessions: { $sum: { $cond: ["$completed", 1, 0] } },
          totalDurationMs: { $sum: "$durationMs" },
          totalScore: { $sum: "$score" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const series = rows.map((r) => ({
      date: r._id,
      totalSessions: r.totalSessions,
      completedSessions: r.completedSessions,
      totalDurationMs: r.totalDurationMs,
      totalScore: r.totalScore,
    }));

    return res.json({
      status: "success",
      days: Number(days),
      series: buildDailySeries(Number(days), series),
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/games/metrics/summary
router.get("/metrics/summary", authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user._id;
    const weekAgo = addDaysUTC(new Date(), -7);
    weekAgo.setUTCHours(0, 0, 0, 0);

    const [totals, topGame, weekStats] = await Promise.all([
      GameSession.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: null,
            totalSessions: { $sum: 1 },
            completedSessions: { $sum: { $cond: ["$completed", 1, 0] } },
            totalDurationMs: { $sum: "$durationMs" },
          },
        },
      ]),
      GameSession.aggregate([
        { $match: { userId } },
        { $group: { _id: "$gameId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
      ]),
      GameSession.aggregate([
        { $match: { userId, startedAt: { $gte: weekAgo } } },
        {
          $group: {
            _id: null,
            sessionsThisWeek: { $sum: 1 },
            minutesThisWeek: { $sum: { $divide: ["$durationMs", 60000] } },
          },
        },
      ]),
    ]);

    const totalRow = totals[0] || {
      totalSessions: 0,
      completedSessions: 0,
      totalDurationMs: 0,
    };
    const weekRow = weekStats[0] || { sessionsThisWeek: 0, minutesThisWeek: 0 };

    return res.json({
      status: "success",
      totalSessions: totalRow.totalSessions,
      completedSessions: totalRow.completedSessions,
      totalDurationMs: totalRow.totalDurationMs,
      favoriteGameId: topGame[0]?._id || null,
      favoriteGameCount: topGame[0]?.count || 0,
      sessionsThisWeek: weekRow.sessionsThisWeek,
      minutesThisWeek: Math.round(weekRow.minutesThisWeek || 0),
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

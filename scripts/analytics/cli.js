#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const mongoose = require("mongoose");
const { connectDatabase } = require("../../config/database");

const TriviaAttempt = require("../../models/TriviaAttempt");
const User = require("../../models/User");

function getArgValue(argv, name) {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function parseIntArg(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDateOnly(dateStr) {
  if (!dateStr) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD.`);
  }
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  return date;
}

function dateToYMD(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ensureParentDir(filePath) {
  const parent = path.dirname(filePath);
  fs.mkdirSync(parent, { recursive: true });
}

function pseudonymizeUserId(userId) {
  const salt = process.env.ANALYTICS_SALT || "dev-salt";
  return crypto.createHmac("sha256", salt).update(String(userId)).digest("hex");
}

function writeCsvRow(stream, values) {
  const escaped = values.map((v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[\n\r,\"]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  });
  stream.write(`${escaped.join(",")}\n`);
}

async function cmdExportTrivia(argv) {
  const out = getArgValue(argv, "--out") || "./exports/trivia_attempts.ndjson";
  const format = (getArgValue(argv, "--format") || "ndjson").toLowerCase();
  const limit = parseIntArg(getArgValue(argv, "--limit"), 0);
  const sinceStr = getArgValue(argv, "--since");
  const untilStr = getArgValue(argv, "--until");

  const since = parseDateOnly(sinceStr);
  const until = parseDateOnly(untilStr);

  const filter = {};
  if (since || until) {
    filter.attemptedAt = {};
    if (since) filter.attemptedAt.$gte = since;
    if (until) filter.attemptedAt.$lt = new Date(until.getTime() + 24 * 60 * 60 * 1000);
  }

  ensureParentDir(out);

  const projection = {
    userId: 1,
    questionId: 1,
    category: 1,
    subDomain: 1,
    isCorrect: 1,
    timeTakenMs: 1,
    attemptedAt: 1,
  };

  const cursor = TriviaAttempt.find(filter, projection)
    .sort({ attemptedAt: 1 })
    .cursor();

  if (!process.env.ANALYTICS_SALT) {
    console.warn("[analytics] ANALYTICS_SALT not set; using a default dev salt. Set it to make pseudonyms stable and non-guessable.");
  }

  if (format === "ndjson") {
    const stream = fs.createWriteStream(out, { encoding: "utf8" });
    let count = 0;
    for await (const doc of cursor) {
      const row = {
        user: pseudonymizeUserId(doc.userId),
        questionId: String(doc.questionId),
        category: doc.category,
        subDomain: doc.subDomain,
        isCorrect: doc.isCorrect,
        timeTakenMs: doc.timeTakenMs,
        attemptedAt: doc.attemptedAt.toISOString(),
      };
      stream.write(`${JSON.stringify(row)}\n`);
      count += 1;
      if (limit > 0 && count >= limit) break;
    }
    stream.end();
    console.log(`[analytics] Exported ${count} trivia attempts to ${out}`);
    return;
  }

  if (format === "csv") {
    const stream = fs.createWriteStream(out, { encoding: "utf8" });
    writeCsvRow(stream, [
      "user",
      "questionId",
      "category",
      "subDomain",
      "isCorrect",
      "timeTakenMs",
      "attemptedAt",
    ]);

    let count = 0;
    for await (const doc of cursor) {
      writeCsvRow(stream, [
        pseudonymizeUserId(doc.userId),
        String(doc.questionId),
        doc.category,
        doc.subDomain,
        doc.isCorrect,
        doc.timeTakenMs,
        doc.attemptedAt.toISOString(),
      ]);
      count += 1;
      if (limit > 0 && count >= limit) break;
    }
    stream.end();
    console.log(`[analytics] Exported ${count} trivia attempts to ${out}`);
    return;
  }

  throw new Error(`Unsupported format: ${format}. Use ndjson or csv.`);
}

async function cmdRollupTopicDaily(argv) {
  const out = getArgValue(argv, "--out") || "./exports/usertopicdaily.json";
  const format = (getArgValue(argv, "--format") || "json").toLowerCase();
  const sinceStr = getArgValue(argv, "--since");
  const untilStr = getArgValue(argv, "--until");

  const since = parseDateOnly(sinceStr);
  const until = parseDateOnly(untilStr);

  const match = {};
  if (since || until) {
    match.attemptedAt = {};
    if (since) match.attemptedAt.$gte = since;
    if (until) match.attemptedAt.$lt = new Date(until.getTime() + 24 * 60 * 60 * 1000);
  }

  const pipeline = [
    Object.keys(match).length ? { $match: match } : null,
    {
      $addFields: {
        day: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$attemptedAt",
            timezone: "UTC",
          },
        },
      },
    },
    {
      $group: {
        _id: {
          day: "$day",
          category: "$category",
          subDomain: "$subDomain",
        },
        attempts: { $sum: 1 },
        correct: { $sum: { $cond: ["$isCorrect", 1, 0] } },
        avgTimeMs: { $avg: "$timeTakenMs" },
        users: { $addToSet: "$userId" },
      },
    },
    {
      $project: {
        _id: 0,
        day: "$_id.day",
        category: "$_id.category",
        subDomain: "$_id.subDomain",
        attempts: 1,
        correct: 1,
        accuracy: {
          $cond: [{ $eq: ["$attempts", 0] }, 0, { $divide: ["$correct", "$attempts"] }],
        },
        avgTimeMs: { $round: ["$avgTimeMs", 2] },
        uniqueUsers: { $size: "$users" },
      },
    },
    { $sort: { day: 1, category: 1, subDomain: 1 } },
  ].filter(Boolean);

  const rows = await TriviaAttempt.aggregate(pipeline);

  ensureParentDir(out);

  if (format === "json") {
    fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
    console.log(`[analytics] Wrote ${rows.length} daily topic rollup rows to ${out}`);
    return;
  }

  if (format === "csv") {
    const stream = fs.createWriteStream(out, { encoding: "utf8" });
    writeCsvRow(stream, [
      "day",
      "category",
      "subDomain",
      "attempts",
      "correct",
      "accuracy",
      "avgTimeMs",
      "uniqueUsers",
    ]);
    for (const r of rows) {
      writeCsvRow(stream, [
        r.day,
        r.category,
        r.subDomain,
        r.attempts,
        r.correct,
        r.accuracy,
        r.avgTimeMs,
        r.uniqueUsers,
      ]);
    }
    stream.end();
    console.log(`[analytics] Wrote ${rows.length} daily topic rollup rows to ${out}`);
    return;
  }

  throw new Error(`Unsupported format: ${format}. Use json or csv.`);
}

async function cmdSeedDemo(argv) {
  const days = parseIntArg(getArgValue(argv, "--days"), 7);
  const usersCount = parseIntArg(getArgValue(argv, "--users"), 3);
  const attemptsPerDay = parseIntArg(getArgValue(argv, "--attempts-per-day"), 30);
  const force = hasFlag(argv, "--force");

  const uri = process.env.MONGO_URI || process.env.MONGO_URL;
  if (!uri) {
    throw new Error("MONGO_URI not set");
  }

  const looksLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(uri);
  if (!looksLocal && !force) {
    throw new Error(
      "Refusing to seed demo data into a non-local MongoDB. Re-run with --force if you really want this."
    );
  }

  const categories = [
    { category: "Memory", subDomain: "Short Term" },
    { category: "Memory", subDomain: "Long Term" },
    { category: "Language", subDomain: "Vocabulary" },
    { category: "Attention", subDomain: "Focus" },
  ];

  const now = new Date();
  const startDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const users = [];
  for (let i = 0; i < usersCount; i += 1) {
    const random = crypto.randomBytes(6).toString("hex");
    users.push(
      new User({
        name: `Analytics Demo ${i + 1}`,
        email: `analytics-demo-${random}@example.com`,
        password: "not-used",
        countryOfOrigin: "US",
        gender: "prefer_not_to_say",
        yearsOfEducation: 12,
      })
    );
  }

  await User.insertMany(users);

  const attempts = [];
  for (let d = 0; d < days; d += 1) {
    const day = new Date(startDay.getTime() - d * 24 * 60 * 60 * 1000);
    for (let a = 0; a < attemptsPerDay; a += 1) {
      const u = users[Math.floor(Math.random() * users.length)];
      const c = categories[Math.floor(Math.random() * categories.length)];
      const isCorrect = Math.random() < 0.7;
      const timeTakenMs = Math.floor(800 + Math.random() * 8000);
      const attemptedAt = new Date(day.getTime() + Math.floor(Math.random() * 24 * 60 * 60 * 1000));
      attempts.push(
        new TriviaAttempt({
          userId: u._id,
          questionId: new mongoose.Types.ObjectId(),
          category: c.category,
          subDomain: c.subDomain,
          selectedAnswer: "A",
          isCorrect,
          timeTakenMs,
          attemptedAt,
        })
      );
    }
  }

  await TriviaAttempt.insertMany(attempts);

  console.log(
    `[analytics] Seeded ${users.length} users and ${attempts.length} trivia attempts across ~${days} days.`
  );
  console.log(`[analytics] Date range: ${dateToYMD(new Date(startDay.getTime() - (days - 1) * 86400000))}..${dateToYMD(startDay)}`);
}

function printHelp() {
  console.log(`\nAnalytics CLI\n\nUsage:\n  node scripts/analytics/cli.js <command> [options]\n\nCommands:\n  export-trivia        Export pseudonymized TriviaAttempt rows (ndjson/csv)\n  rollup-topic-daily   Generate daily topic metrics from TriviaAttempt (json/csv)\n  seed-demo            Insert demo Users + TriviaAttempts (local DB only unless --force)\n\nGlobal env vars:\n  MONGO_URI            MongoDB connection string\n  ANALYTICS_SALT       Secret used to pseudonymize user ids in exports\n\nExamples:\n  ANALYTICS_SALT=... MONGO_URI=... node scripts/analytics/cli.js export-trivia --format ndjson --out ./exports/trivia.ndjson --since 2026-03-01 --limit 100\n  MONGO_URI=... node scripts/analytics/cli.js rollup-topic-daily --format csv --out ./exports/topic_daily.csv --since 2026-03-01 --until 2026-03-09\n\n  # Local-only demo seed\n  MONGO_URI=mongodb://localhost:27017/dementia_database node scripts/analytics/cli.js seed-demo --days 14 --users 5 --attempts-per-day 50\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === "-h" || cmd === "--help") {
    printHelp();
    return;
  }

  await connectDatabase();

  try {
    if (cmd === "export-trivia") {
      await cmdExportTrivia(argv);
      return;
    }
    if (cmd === "rollup-topic-daily") {
      await cmdRollupTopicDaily(argv);
      return;
    }
    if (cmd === "seed-demo") {
      await cmdSeedDemo(argv);
      return;
    }

    throw new Error(`Unknown command: ${cmd}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("[analytics] Failed:", err?.message || err);
  process.exitCode = 1;
});

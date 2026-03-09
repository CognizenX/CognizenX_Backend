const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const TriviaAttempt = require("../../models/TriviaAttempt");
const User = require("../../models/User");
const { buildDailyTopicMetrics } = require("./lib/triviaAggregations");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function escapeCsv(value) {
  if (value == null) return "";
  const s = String(value);
  if (/[\n\r,\"]/g.test(s)) {
    return `"${s.replace(/\"/g, '""')}"`;
  }
  return s;
}

function writeCsv(filePath, rows, header) {
  const lines = [];
  lines.push(header.map(escapeCsv).join(","));
  for (const row of rows) {
    lines.push(header.map((h) => escapeCsv(row[h])).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function hashUserId(userId, salt) {
  const id = String(userId);
  if (!salt) return id;
  return sha256Hex(`${salt}:${id}`);
}

function toIsoDateOnlyUtc(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function buildAttemptMatch(filter) {
  const match = {};
  if (filter?.since || filter?.until) {
    match.attemptedAt = {};
    if (filter.since) match.attemptedAt.$gte = filter.since;
    if (filter.until) match.attemptedAt.$lt = filter.until;
  }
  return match;
}

async function exportTriviaAttemptsRaw({ outDir, filter, salt }) {
  ensureDir(outDir);

  const filePath = path.join(outDir, "trivia_attempts.jsonl");
  const out = fs.createWriteStream(filePath, { encoding: "utf8" });

  const match = buildAttemptMatch(filter);

  const cursor = TriviaAttempt.find(match)
    .sort({ attemptedAt: 1 })
    .cursor();

  let count = 0;
  for await (const attempt of cursor) {
    const doc = attempt.toObject({ minimize: true });

    // Remove internal fields; anonymize user id when salt provided.
    doc.userId = hashUserId(doc.userId, salt);

    out.write(`${JSON.stringify(doc)}\n`);
    count += 1;
  }

  await new Promise((resolve) => out.end(resolve));
  process.stdout.write(`Wrote ${count} rows: ${filePath}\n`);
}

async function exportDailyTopicMetrics({ outDir, filter }) {
  ensureDir(outDir);

  const rows = await buildDailyTopicMetrics(filter);

  const filePath = path.join(outDir, "topic_daily_metrics.csv");
  const header = [
    "date",
    "category",
    "subDomain",
    "attempts",
    "correct",
    "accuracy",
    "avgTimeMs",
    "uniqueUsers",
  ];

  writeCsv(filePath, rows, header);
  process.stdout.write(`Wrote ${rows.length} rows: ${filePath}\n`);
}

async function exportUsersAnonymized({ outDir, salt }) {
  ensureDir(outDir);

  const filePath = path.join(outDir, "users_anonymized.csv");
  const header = [
    "userId",
    "gender",
    "countryOfOrigin",
    "yearsOfEducation",
    "age",
    "dob",
  ];

  const cursor = User.find(
    {},
    {
      gender: 1,
      countryOfOrigin: 1,
      yearsOfEducation: 1,
      age: 1,
      dob: 1,
    }
  )
    .sort({ _id: 1 })
    .cursor();

  const rows = [];
  for await (const user of cursor) {
    const u = user.toObject({ minimize: true });
    rows.push({
      userId: hashUserId(u._id, salt),
      gender: u.gender || "",
      countryOfOrigin: u.countryOfOrigin || "",
      yearsOfEducation: u.yearsOfEducation ?? "",
      age: u.age ?? "",
      dob: u.dob ? toIsoDateOnlyUtc(u.dob) : "",
    });
  }

  writeCsv(filePath, rows, header);
  process.stdout.write(`Wrote ${rows.length} rows: ${filePath}\n`);
}

module.exports = {
  exportTriviaAttemptsRaw,
  exportDailyTopicMetrics,
  exportUsersAnonymized,
  // exported for tests
  hashUserId,
};

/**
 * P0.4 coverage check. Exit 1 when explanations fall below the threshold.
 *
 *   node scripts/script_P0/explanation-coverage.js
 *   node scripts/script_P0/explanation-coverage.js --threshold 0.9
 */
require("dotenv").config();
const mongoose = require("mongoose");
const TriviaCategory = require("../../models/TriviaCategory");

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

async function measure() {
  const docs = await TriviaCategory.find({}, { category: 1, questions: 1 }).lean();
  let total = 0;
  let present = 0;
  const byCategory = new Map();

  for (const doc of docs) {
    for (const question of doc.questions || []) {
      total += 1;
      const category = doc.category || "(none)";
      if (!byCategory.has(category)) byCategory.set(category, { total: 0, present: 0 });
      const row = byCategory.get(category);
      row.total += 1;
      if (String(question.explanation || "").trim()) {
        present += 1;
        row.present += 1;
      }
    }
  }

  return {
    total,
    present,
    missing: total - present,
    coverage: total ? present / total : 1,
    byCategory: [...byCategory.entries()]
      .map(([category, row]) => ({
        category,
        total: row.total,
        missing: row.total - row.present,
        coverage: row.total ? row.present / row.total : 1,
      }))
      .sort((a, b) => b.missing - a.missing),
  };
}

async function main() {
  const threshold = Number(argValue("--threshold", "0.9"));
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }
  await mongoose.connect(process.env.MONGO_URI);
  const report = await measure();
  await mongoose.disconnect();

  const pct = (report.coverage * 100).toFixed(1);
  console.log(`explanation coverage ${pct}% (${report.present}/${report.total}, missing ${report.missing})`);
  for (const row of report.byCategory.filter((item) => item.missing > 0).slice(0, 12)) {
    console.log(`  ${row.category}: missing ${row.missing}/${row.total}`);
  }

  if (report.coverage < threshold) {
    console.error(`coverage ${(report.coverage * 100).toFixed(1)}% is below ${(threshold * 100).toFixed(0)}%`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});

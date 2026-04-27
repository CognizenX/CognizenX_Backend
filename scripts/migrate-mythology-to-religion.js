/**
 * Migration: Mythology -> Religion taxonomy
 *
 * What it does:
 * 1) Changes TriviaCategory category mythology -> religion
 * 2) Leaves subDomain values untouched
 *
 * Usage:
 *   node scripts/migrate-mythology-to-religion.js --dry-run
 *   node scripts/migrate-mythology-to-religion.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const TriviaCategory = require("../models/TriviaCategory");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const START_TS = Date.now();

function toKey(value) {
  return String(value || "").trim().toLowerCase();
}

function log(message) {
  const elapsedSec = ((Date.now() - START_TS) / 1000).toFixed(1);
  console.log(`[MIGRATE +${elapsedSec}s] ${message}`);
}

function canonicalCategory(category) {
  const key = toKey(category);
  if (key === "mythology") return "religion";
  return key;
}

async function migrateTriviaCategories() {
  log("TriviaCategory: scanning documents...");
  const docs = await TriviaCategory.find({
    category: { $in: ["mythology", "Mythology", "religion", "Religion"] },
  });

  let changed = 0;
  for (const doc of docs) {
    const nextCategory = canonicalCategory(doc.category);
    if (doc.category !== nextCategory) {
      doc.category = nextCategory;
      changed += 1;
      if (!DRY_RUN) {
        await doc.save();
      }
    }
  }

  console.log(`TriviaCategory: scanned ${docs.length}, changed ${changed}${DRY_RUN ? " (dry run)" : ""}`);
}

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGO_URL;
  if (!uri) {
    console.error("ERROR: MONGO_URI or MONGO_URL environment variable is required.");
    process.exit(1);
  }

  console.log(`Running mythology->religion migration${DRY_RUN ? " [DRY RUN]" : ""}`);

  log("Connecting to MongoDB...");
  await mongoose.connect(uri);
  log("MongoDB connected.");

  log("Starting migration stage: TriviaCategory");
  await migrateTriviaCategories();

  await mongoose.disconnect();
  log("MongoDB disconnected.");
  console.log("Migration complete.");
}

run().catch(async (err) => {
  console.error("Migration failed:", err);
  try {
    await mongoose.disconnect();
  } catch (disconnectErr) {
    console.error("Failed to disconnect MongoDB cleanly:", disconnectErr.message);
  }
  process.exit(1);
});
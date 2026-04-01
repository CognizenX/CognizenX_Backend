/**
 * Migration: rename the `domain` field to `subDomain` in all triviacategories documents.
 *
 * Run ONCE before deploying the schema changes:
 *   node scripts/migrate-domain-to-subdomain.js
 *
 * Safe to re-run — documents that already have `subDomain` and no `domain` are untouched.
 */

require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGO_URL;
  if (!uri) {
    console.error("ERROR: MONGO_URI or MONGO_URL environment variable is required.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const collection = mongoose.connection.collection("triviacategories");

  // 1. Drop the old unique index FIRST so the rename isn't blocked by it
  try {
    await collection.dropIndex("category_1_domain_1");
    console.log("Dropped old index: category_1_domain_1");
  } catch (err) {
    console.log("Old index not found (already dropped or never created) — skipping.");
  }

  // 2. Rename the field in all documents that still have `domain`
  const renameResult = await collection.updateMany(
    { domain: { $exists: true } },
    { $rename: { domain: "subDomain" } }
  );
  console.log(`Renamed 'domain' → 'subDomain' in ${renameResult.modifiedCount} document(s).`);

  // 3. Ensure the new unique index (category + subDomain) exists
  await collection.createIndex({ category: 1, subDomain: 1 }, { unique: true });
  console.log("Ensured new index: category_1_subDomain_1 (unique)");

  await mongoose.disconnect();
  console.log("Migration complete.");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

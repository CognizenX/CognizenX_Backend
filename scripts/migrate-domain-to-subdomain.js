/**
 * Migration: centralize on `subDomain` and remove legacy `domain`.
 *
 * What it does:
 * 1) triviacategories: rename top-level `domain` -> `subDomain` (legacy schema)
 * 2) useractivities: move embedded categories[].domain -> categories[].subDomain
 *    and remove categories[].domain
 *
 * Run:
 *   node scripts/migrate-domain-to-subdomain.js
 *
 * Safe to re-run.
 */

require("dotenv").config();
const mongoose = require("mongoose");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGO_URL;
  if (!uri) {
    console.error("ERROR: MONGO_URI or MONGO_URL environment variable is required.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  const collection = mongoose.connection.collection("triviacategories");
  const userActivities = mongoose.connection.collection("useractivities");

  // 1. Drop the old unique index FIRST so the rename isn't blocked by it
  if (DRY_RUN) {
    const indexes = await collection.indexes();
    const hasOldIndex = indexes.some((idx) => idx && idx.name === "category_1_domain_1");
    console.log(
      hasOldIndex
        ? "triviacategories: would drop old index: category_1_domain_1 (dry run)."
        : "triviacategories: old index category_1_domain_1 not found — skipping (dry run)."
    );
  } else {
    try {
      await collection.dropIndex("category_1_domain_1");
      console.log("Dropped old index: category_1_domain_1");
    } catch (err) {
      console.log("Old index not found (already dropped or never created) — skipping.");
    }
  }

  // 2. Rename the field in all documents that still have `domain`
  if (DRY_RUN) {
    const matched = await collection.countDocuments({ domain: { $exists: true } });
    console.log(`triviacategories: would rename 'domain' → 'subDomain' in ${matched} document(s) (dry run).`);
  } else {
    const renameResult = await collection.updateMany(
      { domain: { $exists: true } },
      { $rename: { domain: "subDomain" } }
    );
    console.log(`Renamed 'domain' → 'subDomain' in ${renameResult.modifiedCount} document(s).`);
  }

  // 3. Ensure the new unique index (category + subDomain) exists
  if (DRY_RUN) {
    const indexes = await collection.indexes();
    const hasNewIndex = indexes.some((idx) => idx && idx.name === "category_1_subDomain_1");
    console.log(
      hasNewIndex
        ? "triviacategories: new index category_1_subDomain_1 already exists — skipping (dry run)."
        : "triviacategories: would ensure new index category_1_subDomain_1 (unique) (dry run)."
    );
  } else {
    await collection.createIndex({ category: 1, subDomain: 1 }, { unique: true });
    console.log("Ensured new index: category_1_subDomain_1 (unique)");
  }

  // 4) useractivities: rewrite embedded categories[] so subDomain is canonical and domain is removed.
  // We do this per-document to avoid relying on server-side update expressions for array element copying.
  const cursor = userActivities.find({ "categories.domain": { $exists: true } });
  let scanned = 0;
  let changedDocs = 0;
  let droppedEntries = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    scanned += 1;

    const categories = Array.isArray(doc.categories) ? doc.categories : [];
    let changed = false;

    const nextCategories = categories.map((c) => {
      if (!c || typeof c !== 'object') return c;
      const next = { ...c };

      if (next.subDomain == null || String(next.subDomain).trim() === '') {
        if (next.domain != null && String(next.domain).trim() !== '') {
          next.subDomain = next.domain;
          changed = true;
        }
      }

      if (Object.prototype.hasOwnProperty.call(next, 'domain')) {
        delete next.domain;
        changed = true;
      }

      const hasSubDomainNow = next.subDomain != null && String(next.subDomain).trim() !== '';
      if (!hasSubDomainNow) {
        // This entry can't be used by the app/API (subDomain is required).
        droppedEntries += 1;
        changed = true;
        return null;
      }

      return next;
    });

    const prunedCategories = nextCategories.filter((c) => c !== null);

    if (!changed) continue;
    changedDocs += 1;

    if (!DRY_RUN) {
      await userActivities.updateOne(
        { _id: doc._id },
        { $set: { categories: prunedCategories } }
      );
    }
  }

  console.log(
    `useractivities: scanned ${scanned}, changed ${changedDocs}, droppedEntries ${droppedEntries}${DRY_RUN ? ' (dry run)' : ''}`
  );

  await mongoose.disconnect();
  console.log(`Migration complete.${DRY_RUN ? " (dry run)" : ""}`);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

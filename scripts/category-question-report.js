#!/usr/bin/env node
/* eslint-disable no-console */
require("dotenv").config();
const mongoose = require("mongoose");
const { categories } = require("../config/categories");

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGO_URL;
  if (!uri) throw new Error("MONGO_URI not set");

  await mongoose.connect(uri);
  const coll = mongoose.connection.db.collection("triviacategories");

  const docs = await coll
    .find({}, { projection: { category: 1, subDomain: 1, questions: 1, seen: 1 } })
    .toArray();

  const rows = docs
    .map((d) => {
      const questions = d.questions || [];
      return {
        category: d.category,
        subDomain: d.subDomain,
        questionCount: questions.length,
        seenCounter: d.seen || 0,
        aiGenerated: questions.filter((q) => q.aiGenerated).length,
        seenGlobally: questions.filter((q) => q.seenGlobally).length,
      };
    })
    .sort((a, b) => {
      const c = a.category.localeCompare(b.category);
      return c !== 0 ? c : a.subDomain.localeCompare(b.subDomain);
    });

  const totalQuestions = rows.reduce((s, r) => s + r.questionCount, 0);
  const byCategory = {};
  for (const r of rows) {
    if (!byCategory[r.category]) byCategory[r.category] = { subdomains: 0, questions: 0 };
    byCategory[r.category].subdomains += 1;
    byCategory[r.category].questions += r.questionCount;
  }

  const expected = [];
  for (const [cat, subs] of Object.entries(categories)) {
    for (const sub of Object.keys(subs)) {
      expected.push({ category: cat, subDomain: sub });
    }
  }

  const actualKeys = new Set(rows.map((r) => `${r.category}|||${r.subDomain}`));
  const missing = expected.filter((e) => !actualKeys.has(`${e.category}|||${e.subDomain}`));
  const extra = rows.filter(
    (r) => !expected.some((e) => e.category === r.category && e.subDomain === r.subDomain)
  );

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalCategoryDocuments: rows.length,
        totalQuestions,
        byCategory,
        rows,
        missingFromDb: missing,
        extraInDb: extra,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

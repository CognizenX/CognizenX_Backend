#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Audit semantic near-duplicates within each category/subDomain bucket.
 *
 * Usage:
 *   node scripts/audit-semantic-duplicates.js
 *   node scripts/audit-semantic-duplicates.js --category=religion
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const {
  buildEmbeddingCache,
  findMostSimilar,
  SEMANTIC_SIMILARITY_THRESHOLD,
} = require('../services/questionSimilarity');

const args = process.argv.slice(2);
const categoryArg = args.find((a) => a.startsWith('--category='));
const categoryFilter = categoryArg ? categoryArg.split('=')[1] : null;

async function auditDocument(doc) {
  const questions = Array.isArray(doc.questions) ? doc.questions : [];
  const entries = await buildEmbeddingCache(questions);
  const pairs = [];

  for (let i = 0; i < entries.length; i += 1) {
    const others = entries.filter((_, idx) => idx !== i);
    const match = findMostSimilar(entries[i].embedding, others, SEMANTIC_SIMILARITY_THRESHOLD);
    if (match) {
      pairs.push({
        questionA: entries[i].question,
        questionB: match.question,
        score: match.score,
      });
    }
  }

  return {
    category: doc.category,
    subDomain: doc.subDomain,
    questionCount: questions.length,
    similarPairs: pairs,
  };
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGO_URL;
  if (!uri) {
    throw new Error('MONGO_URI not set');
  }

  await mongoose.connect(uri);
  const filter = categoryFilter ? { category: categoryFilter } : {};
  const docs = await mongoose.connection.db
    .collection('triviacategories')
    .find(filter, { projection: { category: 1, subDomain: 1, questions: 1 } })
    .toArray();

  const audits = [];
  for (const doc of docs) {
    if (!doc.questions || doc.questions.length < 2) {
      continue;
    }
    audits.push(await auditDocument(doc));
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    threshold: SEMANTIC_SIMILARITY_THRESHOLD,
    bucketsScanned: audits.length,
    bucketsWithSimilarPairs: audits.filter((a) => a.similarPairs.length > 0).length,
    totalSimilarPairs: audits.reduce((sum, a) => sum + a.similarPairs.length, 0),
    audits: audits.filter((a) => a.similarPairs.length > 0),
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(
    path.join(__dirname, '..', 'reports'),
    `semantic-audit-${timestamp}.json`
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report: ${reportPath}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('[AUDIT] Failed:', error.message);
  try {
    await mongoose.disconnect();
  } catch (disconnectError) {
    console.error(disconnectError.message);
  }
  process.exit(1);
});

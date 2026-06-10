#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const { selectQuizQuestions } = require('../services/questionSelection');

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGO_URL;
  if (!uri) throw new Error('MONGO_URI not set');

  const userId = process.argv[2];
  const category = process.argv[3] || 'religion';
  const subDomain = process.argv[4] || 'Islam';
  const sessions = Number(process.argv[5] || 10);

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error('Usage: node scripts/simulate-user-sessions.js <userId> [category] [subDomain] [sessions]');
  }

  await mongoose.connect(uri);

  const seen = new Set();
  let repeats = 0;
  let totalServed = 0;
  const mixTotals = { fresh: 0, review: 0, mastered: 0 };

  for (let session = 1; session <= sessions; session += 1) {
    const result = await selectQuizQuestions({
      userId: new mongoose.Types.ObjectId(userId),
      categories: [category],
      subDomain,
      limit: 10,
    });

    for (const question of result.questions) {
      const id = String(question._id);
      totalServed += 1;
      if (seen.has(id)) repeats += 1;
      seen.add(id);
    }

    mixTotals.fresh += result.mix.fresh;
    mixTotals.review += result.mix.review;
    mixTotals.mastered += result.mix.mastered;

    console.log(
      `Session ${session}: served=${result.questions.length} uniqueTotal=${seen.size} mix=${JSON.stringify(result.mix)}`
    );
  }

  const repeatRate = totalServed > 0 ? (repeats / totalServed) * 100 : 0;
  console.log('\n=== Simulation Summary ===');
  console.log(JSON.stringify({
    userId,
    category,
    subDomain,
    sessions,
    totalServed,
    uniqueQuestions: seen.size,
    repeats,
    repeatRatePercent: Number(repeatRate.toFixed(2)),
    mixTotals,
  }, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

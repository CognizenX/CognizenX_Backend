#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Audit + purge semantic near-duplicates within each category/subDomain bucket.
 * After within-bucket purge, merges cricket variants into sports/Cricket.
 *
 * Usage:
 *   node scripts/purge-semantic-duplicates.js
 *   node scripts/purge-semantic-duplicates.js --category=sports
 *   node scripts/purge-semantic-duplicates.js --confirm
 *   node scripts/purge-semantic-duplicates.js --confirm --category=sports
 *   node scripts/purge-semantic-duplicates.js --skip-cricket-merge
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const {
  buildEmbeddingCache,
  SEMANTIC_SIMILARITY_THRESHOLD,
} = require('../services/questionSimilarity');
const {
  buildSimilarityClusters,
  decideRemovals,
} = require('../services/semanticDedupClusters');
const UserQuestionStats = require('../models/UserQuestionStats');

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const SKIP_CRICKET_MERGE = args.includes('--skip-cricket-merge');
const categoryArg = args.find((a) => a.startsWith('--category='));
const categoryFilter = categoryArg ? categoryArg.split('=')[1] : null;
const subDomainArg = args.find((a) => a.startsWith('--subDomain='));
const subDomainFilter = subDomainArg ? subDomainArg.split('=')[1] : null;

const BUCKET_DELAY_MS = 500;

const CRICKET_TARGET = { category: 'sports', subDomain: 'Cricket' };
const CRICKET_LEGACY = [
  { category: 'sports', subDomain: 'cricket' },
  { category: 'entertainment', subDomain: 'cricket' },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureReportsDir() {
  const dir = path.join(__dirname, '..', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function bucketKey(category, subDomain) {
  return `${category}|||${subDomain}`;
}

function serializeQuestion(q) {
  return {
    _id: q._id ? String(q._id) : null,
    question: q.question,
    options: q.options,
    correct_answer: q.correct_answer || q.correctAnswer,
    correctAnswer: q.correctAnswer || q.correct_answer,
    subDomain: q.subDomain,
    createdAt: q.createdAt,
    aiGenerated: q.aiGenerated,
    difficulty: q.difficulty,
    validated: q.validated,
    explanation: q.explanation,
    explanationGeneratedAt: q.explanationGeneratedAt,
    seenGlobally: q.seenGlobally,
    hasEmbedding: Array.isArray(q.embedding) && q.embedding.length > 0,
  };
}

/**
 * Attach freshly computed embeddings onto question objects in memory,
 * and return which question ids need DB persistence.
 */
function applyEmbeddingsToQuestions(questions, cacheEntries) {
  const byId = new Map(
    cacheEntries
      .filter((e) => e.questionId)
      .map((e) => [e.questionId, e.embedding])
  );
  const needsPersist = [];

  for (const q of questions) {
    const id = q._id ? String(q._id) : null;
    if (!id) continue;
    const embedding = byId.get(id);
    if (!embedding) continue;

    const had =
      Array.isArray(q.embedding) && q.embedding.length > 0;
    if (!had) {
      q.embedding = embedding;
      needsPersist.push(id);
    }
  }

  return needsPersist;
}

async function persistEmbeddings(coll, docId, questions, questionIdsToPersist) {
  if (!questionIdsToPersist.length) return 0;

  const idSet = new Set(questionIdsToPersist);
  let updated = 0;

  for (const q of questions) {
    const id = q._id ? String(q._id) : null;
    if (!id || !idSet.has(id)) continue;
    if (!Array.isArray(q.embedding) || q.embedding.length === 0) continue;

    // eslint-disable-next-line no-await-in-loop
    const result = await coll.updateOne(
      { _id: docId, 'questions._id': q._id },
      { $set: { 'questions.$.embedding': q.embedding } }
    );
    updated += result.modifiedCount;
  }

  return updated;
}

async function analyzeBucket(questions, threshold) {
  const usable = questions.filter((q) => q?._id && String(q.question || '').trim());
  if (usable.length < 2) {
    return {
      questionCount: questions.length,
      usableCount: usable.length,
      embeddingsComputed: 0,
      pairs: [],
      clusters: [],
      decisions: [],
      removeIds: [],
      removeQuestions: [],
      survivors: usable,
      needsPersistIds: [],
    };
  }

  const cacheEntries = await buildEmbeddingCache(usable);
  const needsPersistIds = applyEmbeddingsToQuestions(usable, cacheEntries);

  const entries = cacheEntries
    .filter((e) => e.questionId && Array.isArray(e.embedding))
    .map((e) => ({
      id: e.questionId,
      embedding: e.embedding,
      question: e.question,
    }));

  const { pairs, clusters } = buildSimilarityClusters(entries, threshold);
  const questionsById = new Map(usable.map((q) => [String(q._id), q]));
  const { decisions, removeIds } = decideRemovals(clusters, questionsById);
  const removeSet = new Set(removeIds);

  return {
    questionCount: questions.length,
    usableCount: usable.length,
    embeddingsComputed: needsPersistIds.length,
    pairs,
    clusters,
    decisions,
    removeIds,
    removeQuestions: removeIds.map((id) => serializeQuestion(questionsById.get(id))).filter((q) => q._id),
    survivors: usable.filter((q) => !removeSet.has(String(q._id))),
    needsPersistIds,
  };
}

function toPlainQuestion(q, subDomainOverride) {
  return {
    _id: q._id,
    question: q.question,
    options: Array.isArray(q.options) ? [...q.options] : q.options,
    correct_answer: q.correct_answer,
    correctAnswer: q.correctAnswer,
    subDomain: subDomainOverride !== undefined ? subDomainOverride : q.subDomain,
    createdAt: q.createdAt,
    aiGenerated: q.aiGenerated,
    difficulty: q.difficulty,
    validated: q.validated,
    explanation: q.explanation,
    explanationGeneratedAt: q.explanationGeneratedAt,
    embedding: q.embedding,
    seenGlobally: q.seenGlobally,
  };
}

async function purgeBucket(coll, doc, analysis, confirm) {
  const result = {
    category: doc.category,
    subDomain: doc.subDomain,
    questionCount: analysis.questionCount,
    clustersFound: analysis.clusters.length,
    wouldRemove: analysis.removeIds.length,
    embeddingsBackfilled: 0,
    removed: 0,
    finalCount: analysis.questionCount - analysis.removeIds.length,
  };

  result.embeddingsBackfilled = await persistEmbeddings(
    coll,
    doc._id,
    doc.questions || [],
    analysis.needsPersistIds
  );

  if (!confirm || analysis.removeIds.length === 0) {
    return result;
  }

  const removeSet = new Set(analysis.removeIds);
  const kept = (doc.questions || []).filter((q) => !removeSet.has(String(q._id)));
  const seen = kept.filter((q) => q.seenGlobally === true).length;

  await coll.updateOne(
    { _id: doc._id },
    { $set: { questions: kept, seen } }
  );

  result.removed = analysis.removeIds.length;
  result.finalCount = kept.length;
  return result;
}

async function cleanupUserStats(removedIds) {
  if (!removedIds.length) return 0;
  const objectIds = removedIds
    .filter(Boolean)
    .map((id) => {
      try {
        return new mongoose.Types.ObjectId(id);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (!objectIds.length) return 0;

  const res = await UserQuestionStats.deleteMany({
    questionId: { $in: objectIds },
  });
  return res.deletedCount || 0;
}

function shouldRunCricketMerge(categoryFilter, subDomainFilter) {
  if (SKIP_CRICKET_MERGE) return false;
  if (!categoryFilter && !subDomainFilter) return true;
  if (categoryFilter === 'sports' || categoryFilter === 'entertainment') {
    if (!subDomainFilter) return true;
    return (
      subDomainFilter === 'Cricket' ||
      subDomainFilter === 'cricket'
    );
  }
  return false;
}

async function mergeCricket(coll, threshold, confirm) {
  const keys = [CRICKET_TARGET, ...CRICKET_LEGACY];
  const docs = [];

  for (const key of keys) {
    // eslint-disable-next-line no-await-in-loop
    const doc = await coll.findOne({
      category: key.category,
      subDomain: key.subDomain,
    });
    if (doc) docs.push(doc);
  }

  const report = {
    target: CRICKET_TARGET,
    legacy: CRICKET_LEGACY,
    sourceBuckets: docs.map((d) => ({
      category: d.category,
      subDomain: d.subDomain,
      questionCount: (d.questions || []).length,
    })),
    combinedBefore: 0,
    clustersFound: 0,
    wouldRemove: 0,
    finalCount: 0,
    deletedLegacyDocs: [],
    embeddingsBackfilled: 0,
    statsDeleted: 0,
    dryRun: !confirm,
  };

  if (docs.length === 0) {
    report.note = 'No cricket buckets found';
    return report;
  }

  const combined = [];
  for (const doc of docs) {
    for (const q of doc.questions || []) {
      combined.push({
        ...q,
        _sourceCategory: doc.category,
        _sourceSubDomain: doc.subDomain,
      });
    }
  }
  report.combinedBefore = combined.length;

  const analysis = await analyzeBucket(combined, threshold);
  report.clustersFound = analysis.clusters.length;
  report.wouldRemove = analysis.removeIds.length;
  report.sampleRemovals = analysis.decisions.slice(0, 20).map((d) => ({
    keepId: d.keepId,
    removeIds: d.removeIds,
  }));

  // Persist embeddings onto whichever doc each question currently lives in
  for (const doc of docs) {
    const idsInDoc = new Set(
      (doc.questions || []).map((q) => String(q._id))
    );
    const persistIds = analysis.needsPersistIds.filter((id) => idsInDoc.has(id));
    // eslint-disable-next-line no-await-in-loop
    const n = await persistEmbeddings(coll, doc._id, doc.questions || [], persistIds);
    report.embeddingsBackfilled += n;
  }

  const survivors = analysis.survivors.map((q) => toPlainQuestion(q, 'Cricket'));

  report.finalCount = survivors.length;
  report.removeQuestions = analysis.removeQuestions;

  if (!confirm) {
    return report;
  }

  let targetDoc = docs.find(
    (d) => d.category === 'sports' && d.subDomain === 'Cricket'
  );

  if (!targetDoc) {
    const insert = await coll.insertOne({
      category: 'sports',
      subDomain: 'Cricket',
      questions: [],
      seen: 0,
      createdAt: new Date(),
    });
    targetDoc = await coll.findOne({ _id: insert.insertedId });
  }

  const seen = survivors.filter((q) => q.seenGlobally === true).length;
  await coll.updateOne(
    { _id: targetDoc._id },
    { $set: { questions: survivors, seen, category: 'sports', subDomain: 'Cricket' } }
  );

  for (const legacy of CRICKET_LEGACY) {
    // eslint-disable-next-line no-await-in-loop
    const del = await coll.deleteOne({
      category: legacy.category,
      subDomain: legacy.subDomain,
    });
    if (del.deletedCount) {
      report.deletedLegacyDocs.push(legacy);
    }
  }

  report.statsDeleted = await cleanupUserStats(analysis.removeIds);
  return report;
}

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGO_URL;
  if (!uri) {
    throw new Error('MONGO_URI not set');
  }
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim().length < 20) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const threshold = SEMANTIC_SIMILARITY_THRESHOLD;
  console.log(
    `[PURGE] mode=${CONFIRM ? 'CONFIRM' : 'DRY-RUN'} threshold=${threshold}` +
      (categoryFilter ? ` category=${categoryFilter}` : '') +
      (subDomainFilter ? ` subDomain=${subDomainFilter}` : '')
  );

  await mongoose.connect(uri);
  const coll = mongoose.connection.db.collection('triviacategories');

  const filter = {};
  if (categoryFilter) filter.category = categoryFilter;
  if (subDomainFilter) filter.subDomain = subDomainFilter;

  const docs = await coll
    .find(filter, {
      projection: {
        category: 1,
        subDomain: 1,
        questions: 1,
        seen: 1,
      },
    })
    .toArray();

  // When merging cricket, still purge non-cricket docs in filter;
  // skip within-bucket purge for cricket sources (handled in merge).
  const cricketKeys = new Set([
    bucketKey('sports', 'Cricket'),
    bucketKey('sports', 'cricket'),
    bucketKey('entertainment', 'cricket'),
  ]);
  const runMerge = shouldRunCricketMerge(categoryFilter, subDomainFilter);

  const bucketReports = [];
  const allRemoved = [];
  let totalWouldRemove = 0;
  let totalRemoved = 0;
  let totalStatsDeleted = 0;
  let totalEmbeddingsBackfilled = 0;

  for (let i = 0; i < docs.length; i += 1) {
    const doc = docs[i];
    const key = bucketKey(doc.category, doc.subDomain);

    if (runMerge && cricketKeys.has(key)) {
      console.log(`[PURGE] Skipping within-bucket for ${key} (deferred to cricket merge)`);
      continue;
    }

    console.log(
      `[PURGE] (${i + 1}/${docs.length}) ${doc.category}/${doc.subDomain} ` +
        `questions=${(doc.questions || []).length}`
    );

    // eslint-disable-next-line no-await-in-loop
    const analysis = await analyzeBucket(doc.questions || [], threshold);
    // eslint-disable-next-line no-await-in-loop
    const bucketResult = await purgeBucket(coll, doc, analysis, CONFIRM);

    totalWouldRemove += analysis.removeIds.length;
    totalRemoved += bucketResult.removed;
    totalEmbeddingsBackfilled += bucketResult.embeddingsBackfilled;

    if (CONFIRM && analysis.removeIds.length) {
      // eslint-disable-next-line no-await-in-loop
      const statsDeleted = await cleanupUserStats(analysis.removeIds);
      totalStatsDeleted += statsDeleted;
      bucketResult.statsDeleted = statsDeleted;
    }

    allRemoved.push(
      ...analysis.removeQuestions.map((q) => ({
        category: doc.category,
        subDomain: doc.subDomain,
        ...q,
      }))
    );

    bucketReports.push({
      ...bucketResult,
      samplePairs: analysis.pairs
        .slice(0, 5)
        .map((p) => ({ idA: p.idA, idB: p.idB, score: Number(p.score.toFixed(4)) })),
      decisions: analysis.decisions.slice(0, 10),
    });

    // eslint-disable-next-line no-await-in-loop
    await sleep(BUCKET_DELAY_MS);
  }

  let cricketMerge = null;
  if (runMerge) {
    console.log('[PURGE] Running cricket merge into sports/Cricket...');
    cricketMerge = await mergeCricket(coll, threshold, CONFIRM);
    totalWouldRemove += cricketMerge.wouldRemove || 0;
    totalEmbeddingsBackfilled += cricketMerge.embeddingsBackfilled || 0;
    if (CONFIRM) {
      totalRemoved += cricketMerge.wouldRemove || 0;
      totalStatsDeleted += cricketMerge.statsDeleted || 0;
    }
    if (Array.isArray(cricketMerge.removeQuestions)) {
      allRemoved.push(
        ...cricketMerge.removeQuestions.map((q) => ({
          category: 'sports',
          subDomain: 'Cricket(merge)',
          ...q,
        }))
      );
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportsDir = ensureReportsDir();
  const summary = {
    generatedAt: new Date().toISOString(),
    mode: CONFIRM ? 'confirm' : 'dry-run',
    threshold,
    categoryFilter,
    subDomainFilter,
    bucketsProcessed: bucketReports.length,
    totalWouldRemove,
    totalRemoved,
    totalStatsDeleted,
    totalEmbeddingsBackfilled,
    buckets: bucketReports,
    cricketMerge,
    junkBucketsNoted: docs
      .filter((d) => {
        const catchAll =
          d.subDomain &&
          String(d.subDomain).toLowerCase() === String(d.category).toLowerCase();
        const typo = d.category === 'Scienftrfvrfce';
        return catchAll || typo;
      })
      .map((d) => ({
        category: d.category,
        subDomain: d.subDomain,
        questionCount: (d.questions || []).length,
        note: 'Deduped in place only; not deleted this pass',
      })),
  };

  const reportPath = path.join(reportsDir, `semantic-purge-${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));

  const backupPath = path.join(
    reportsDir,
    `semantic-purge-${timestamp}-removed-backup.json`
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: CONFIRM ? 'confirm' : 'dry-run',
        removedCount: allRemoved.length,
        removed: allRemoved,
      },
      null,
      2
    )
  );

  console.log(
    JSON.stringify(
      {
        mode: summary.mode,
        bucketsProcessed: summary.bucketsProcessed,
        totalWouldRemove: summary.totalWouldRemove,
        totalRemoved: summary.totalRemoved,
        totalStatsDeleted: summary.totalStatsDeleted,
        totalEmbeddingsBackfilled: summary.totalEmbeddingsBackfilled,
        cricketMerge: cricketMerge
          ? {
              combinedBefore: cricketMerge.combinedBefore,
              wouldRemove: cricketMerge.wouldRemove,
              finalCount: cricketMerge.finalCount,
              deletedLegacyDocs: cricketMerge.deletedLegacyDocs,
            }
          : null,
        reportPath,
        backupPath,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('[PURGE] Failed:', error.message);
  console.error(error.stack);
  try {
    await mongoose.disconnect();
  } catch (disconnectError) {
    console.error(disconnectError.message);
  }
  process.exit(1);
});

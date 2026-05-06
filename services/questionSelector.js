const mongoose = require("mongoose");

const TriviaCategory = require("../models/TriviaCategory");
const UserQuestionStats = require("../models/UserQuestionStats");

const SESSION_SIZE = 10;
const WRONG_TARGET = 3;
const CORRECT_TARGET = 3;
const WRONG_POOL_LIMIT = 8; // Fetch up to 8 to allow for some randomness in case of ties
const CORRECT_POOL_LIMIT = 8; // Fetch up to 8 to have a larger cool-off pool to sample from

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function uniqueObjectIdStrings(ids) {
  const out = [];
  const seen = new Set();
  for (const id of ids || []) {
    const s = String(id);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(id);
    }
  }
  return out;
}

function toObjectIdArray(ids) {
  return (ids || []).map((id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id)));
}

function stripAnswersProjection() {
  return {
    correct_answer: 0,
    correctAnswer: 0,
  };
}

async function fetchQuestionsByIds({ category, subDomain, ids }) {
  if (!ids || ids.length === 0) return [];

  const objectIds = toObjectIdArray(uniqueObjectIdStrings(ids));

  const rows = await TriviaCategory.aggregate([
    { $match: { category, subDomain } },
    { $unwind: "$questions" },
    { $match: { "questions._id": { $in: objectIds } } },
    { $replaceRoot: { newRoot: "$questions" } },
    { $project: stripAnswersProjection() },
  ]);

  return rows || [];
}

async function sampleUnseenQuestions({ category, subDomain, excludeIds, size }) {
  if (!size || size <= 0) return [];

  const excludeObjectIds = toObjectIdArray(uniqueObjectIdStrings(excludeIds));

  const pipeline = [
    { $match: { category, subDomain } },
    { $unwind: "$questions" },
  ];

  if (excludeObjectIds.length > 0) {
    pipeline.push({ $match: { "questions._id": { $nin: excludeObjectIds } } });
  }

  pipeline.push(
    { $sample: { size } },
    { $replaceRoot: { newRoot: "$questions" } },
    { $project: stripAnswersProjection() }
  );

  const rows = await TriviaCategory.aggregate(pipeline);
  return rows || [];
}

async function sampleSeenQuestions({ category, subDomain, includeIds, size }) {
  if (!size || size <= 0) return [];
  if (!includeIds || includeIds.length === 0) return [];

  const includeObjectIds = toObjectIdArray(uniqueObjectIdStrings(includeIds));

  const rows = await TriviaCategory.aggregate([
    { $match: { category, subDomain } },
    { $unwind: "$questions" },
    { $match: { "questions._id": { $in: includeObjectIds } } },
    { $sample: { size } },
    { $replaceRoot: { newRoot: "$questions" } },
    { $project: stripAnswersProjection() },
  ]);

  return rows || [];
}

/**
 * Build a 10-question session for a given user/category/subDomain.
 *
 * Selection rules:
 * - Up to 3 from WRONG pool (highest incorrectCount)
 * - Up to 3 from CORRECT pool (cool-off 2+ days; least recently correct first)
 * - Fill remainder from UNSEEN pool (random via $sample)
 * - If still short, pad with any SEEN questions not already picked
 * - If question bank is small, return however many are available
 */
async function buildSession(userId, category, subDomain) {
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  const statsScope = { userId, category, subDomain };

  // WRONG POOL + already-seen set (parallel)
  const [wrongStats, alreadySeenByUser] = await Promise.all([
    UserQuestionStats.find(
      { ...statsScope, incorrectCount: { $gt: 0 } },
      { questionId: 1, _id: 0 }
    )
      .sort({ incorrectCount: -1 })
      .limit(WRONG_POOL_LIMIT)
      .lean(),

    UserQuestionStats.distinct("questionId", statsScope),
  ]);

  shuffleInPlace(wrongStats);
  const wrongIds = uniqueObjectIdStrings(
    wrongStats.slice(0, WRONG_TARGET).map((d) => d.questionId)
  );

  // CORRECT POOL (cool-off)
  // NOTE: In MongoDB, `null < Date` is true due to BSON type ordering.
  // We must explicitly exclude nulls so existing users with lastCorrectAt=null
  // do not get pulled into the cooled-off pool.
  const correctFilter = {
    ...statsScope,
    correctCount: { $gt: 0 },
    lastCorrectAt: { $ne: null, $lt: twoDaysAgo },
  };
  if (wrongIds.length > 0) {
    correctFilter.questionId = { $nin: wrongIds };
  }

  const correctStats = await UserQuestionStats.find(
    correctFilter,
    { questionId: 1, _id: 0 }
  )
    .sort({ lastCorrectAt: 1 })
    .limit(CORRECT_POOL_LIMIT)
    .lean();

  shuffleInPlace(correctStats);
  const correctIds = uniqueObjectIdStrings(
    correctStats.slice(0, CORRECT_TARGET).map((d) => d.questionId)
  );

  const seenPickedIds = uniqueObjectIdStrings([...wrongIds, ...correctIds]);
  const shortfall = Math.max(0, WRONG_TARGET + CORRECT_TARGET - seenPickedIds.length);
  const unseenTarget = Math.max(0, SESSION_SIZE - (WRONG_TARGET + CORRECT_TARGET) + shortfall);

  // Fetch question documents for wrong/correct ids
  const [wrongQuestions, correctQuestions] = await Promise.all([
    fetchQuestionsByIds({ category, subDomain, ids: wrongIds }),
    fetchQuestionsByIds({ category, subDomain, ids: correctIds }),
  ]);

  // UNSEEN POOL (random)
  const unseenQuestions = await sampleUnseenQuestions({
    category,
    subDomain,
    excludeIds: alreadySeenByUser,
    size: unseenTarget,
  });

  const picked = [];
  const pickedIdSet = new Set();
  const addPicked = (q) => {
    if (!q || !q._id) return;
    const key = String(q._id);
    if (pickedIdSet.has(key)) return;
    pickedIdSet.add(key);
    picked.push(q);
  };

  wrongQuestions.forEach(addPicked);
  correctQuestions.forEach(addPicked);
  unseenQuestions.forEach(addPicked);

  // PAD FROM SEEN IF STILL SHORT
  const remainingNeeded = SESSION_SIZE - picked.length;
  if (remainingNeeded > 0) {
    const candidateSeenIds = (alreadySeenByUser || []).filter((id) => !pickedIdSet.has(String(id)));

    const padQuestions = await sampleSeenQuestions({
      category,
      subDomain,
      includeIds: candidateSeenIds,
      size: remainingNeeded,
    });

    padQuestions.forEach(addPicked);
  }

  shuffleInPlace(picked);
  return picked.slice(0, SESSION_SIZE);
}

module.exports = {
  buildSession,
};

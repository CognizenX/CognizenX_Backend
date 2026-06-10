const TriviaCategory = require('../models/TriviaCategory');
const UserQuestionStats = require('../models/UserQuestionStats');
const { normaliseForResponse } = require('../utils/questionFormatter');
const {
  normaliseTaxonomyInput,
  buildCategoryOnlyQuery,
  buildCategorySubDomainQuery,
  normaliseSubDomain,
} = require('../utils/taxonomy');
const { isDueForReview, isMastered, FRESH_SLOTS_RATIO } = require('./reviewScheduler');

const DEFAULT_LIMIT = 10;

function shuffleArray(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandom(items, count) {
  return shuffleArray(items).slice(0, Math.max(0, count));
}

function classifyUserQuestions(bankQuestions, statsByQuestionId, now = new Date()) {
  const fresh = [];
  const dueReview = [];
  const mastered = [];
  const pendingReview = [];

  for (const question of bankQuestions) {
    const qid = String(question._id);
    const stats = statsByQuestionId.get(qid);

    if (!stats) {
      fresh.push(question);
      continue;
    }

    if (isMastered(stats)) {
      mastered.push({ question, stats });
      continue;
    }

    if (isDueForReview(stats, now)) {
      dueReview.push({ question, stats });
      continue;
    }

    pendingReview.push({ question, stats });
  }

  return { fresh, dueReview, mastered, pendingReview };
}

function allocateQuizSlots({ fresh, dueReview, mastered }, limit = DEFAULT_LIMIT) {
  const reviewTarget = Math.floor(limit * (1 - FRESH_SLOTS_RATIO));
  const freshTarget = limit - reviewTarget;

  const selected = [];
  const selectedIds = new Set();

  const unwrapQuestion = (item) => {
    if (item?.question?._id) return item.question;
    if (item?._id) return item;
    return item;
  };

  const addQuestions = (items) => {
    for (const item of items) {
      const question = unwrapQuestion(item);
      const id = String(question._id);
      if (selectedIds.has(id)) continue;
      selectedIds.add(id);
      selected.push(question);
      if (selected.length >= limit) break;
    }
  };

  addQuestions(pickRandom(fresh, freshTarget));
  addQuestions(pickRandom(dueReview, reviewTarget));

  if (selected.length < limit) {
    const remainingFresh = fresh.filter((q) => !selectedIds.has(String(q._id)));
    addQuestions(pickRandom(remainingFresh, limit - selected.length));
  }

  if (selected.length < limit) {
    addQuestions(pickRandom(dueReview, limit - selected.length));
  }

  if (selected.length < limit) {
    const lruMastered = [...mastered].sort((a, b) => {
      const aTime = a.stats?.lastAttemptedAt ? new Date(a.stats.lastAttemptedAt).getTime() : 0;
      const bTime = b.stats?.lastAttemptedAt ? new Date(b.stats.lastAttemptedAt).getTime() : 0;
      return aTime - bTime;
    });
    addQuestions(lruMastered.map((entry) => entry.question));
  }

  return {
    questions: selected,
    mix: {
      fresh: selected.filter((q) => fresh.some((f) => String(f._id) === String(q._id))).length,
      review: selected.filter((q) => dueReview.some((r) => String(r.question._id) === String(q._id))).length,
      mastered: selected.filter((q) => mastered.some((m) => String(m.question._id) === String(q._id))).length,
    },
  };
}

async function loadBankQuestions({ categories, subDomain }) {
  const savedQuestions = [];

  for (const category of categories) {
    const query = subDomain
      ? buildCategorySubDomainQuery(category, subDomain)
      : buildCategoryOnlyQuery(category);

    const triviaCategory = await TriviaCategory.findOne(query);
    if (!triviaCategory || triviaCategory.questions.length === 0) continue;

    let categoryQuestions = triviaCategory.questions;
    if (subDomain) {
      categoryQuestions = triviaCategory.questions.filter((q) => {
        const questionSubDomain = normaliseSubDomain(q.subDomain || triviaCategory.subDomain, category);
        const categorySubDomain = normaliseSubDomain(triviaCategory.subDomain, category);
        return questionSubDomain === subDomain || categorySubDomain === subDomain;
      });
    }

    savedQuestions.push(...categoryQuestions);
  }

  return savedQuestions;
}

async function loadUserStatsMap(userId, questionIds) {
  if (!questionIds.length) return new Map();

  const stats = await UserQuestionStats.find({
    userId,
    questionId: { $in: questionIds },
  }).lean();

  return new Map(stats.map((entry) => [String(entry.questionId), entry]));
}

async function selectQuizQuestions({
  userId,
  categories,
  subDomain,
  limit = DEFAULT_LIMIT,
  now = new Date(),
}) {
  const bankQuestions = await loadBankQuestions({ categories, subDomain });
  const questionIds = bankQuestions.map((q) => q._id);
  const statsByQuestionId = await loadUserStatsMap(userId, questionIds);

  const classified = classifyUserQuestions(bankQuestions, statsByQuestionId, now);
  const { questions, mix } = allocateQuizSlots(classified, limit);

  return {
    questions: questions.map(normaliseForResponse),
    totalAvailable: bankQuestions.length,
    mix,
    pools: {
      fresh: classified.fresh.length,
      dueReview: classified.dueReview.length,
      mastered: classified.mastered.length,
      pendingReview: classified.pendingReview.length,
    },
  };
}

module.exports = {
  classifyUserQuestions,
  allocateQuizSlots,
  selectQuizQuestions,
  loadBankQuestions,
  DEFAULT_LIMIT,
};

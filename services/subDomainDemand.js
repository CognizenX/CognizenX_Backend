const { categories } = require('../config/categories');
const TriviaCategory = require('../models/TriviaCategory');
const TriviaAttempt = require('../models/TriviaAttempt');
const UserQuestionStats = require('../models/UserQuestionStats');
const UserActivity = require('../models/UserActivity');
const { buildCategorySubDomainQuery } = require('../utils/taxonomy');

const USER_EXHAUSTION_RATIO = Number(process.env.USER_EXHAUSTION_RATIO || 0.9);

function envNumber(name, fallback) {
  return Number(process.env[name] || fallback);
}

function getISOWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function listCanonicalPairs() {
  const pairs = [];
  for (const category of Object.keys(categories)) {
    for (const subDomain of Object.keys(categories[category])) {
      pairs.push({ category, subDomain });
    }
  }
  return pairs;
}

async function getBankSize(category, subDomain) {
  const doc = await TriviaCategory.findOne(
    buildCategorySubDomainQuery(category, subDomain),
    { questions: 1 }
  ).lean();
  return Array.isArray(doc?.questions) ? doc.questions.length : 0;
}

async function getUserCoverageMetrics(category, subDomain, bankSize) {
  if (bankSize === 0) {
    return { maxUserCoverage: 0, exhaustedUserCount: 0 };
  }

  const coverageRows = await UserQuestionStats.aggregate([
    { $match: { category, subDomain } },
    { $group: { _id: '$userId', coverage: { $sum: 1 } } },
  ]);

  const threshold = Math.ceil(bankSize * USER_EXHAUSTION_RATIO);
  let maxUserCoverage = 0;
  let exhaustedUserCount = 0;

  for (const row of coverageRows) {
    maxUserCoverage = Math.max(maxUserCoverage, row.coverage);
    if (row.coverage >= threshold) {
      exhaustedUserCount += 1;
    }
  }

  return { maxUserCoverage, exhaustedUserCount };
}

async function getWeeklyAttemptMetrics(category, subDomain, since) {
  const match = {
    category,
    subDomain,
    attemptedAt: { $gte: since },
  };

  const [attemptCount, activeUsers] = await Promise.all([
    TriviaAttempt.countDocuments(match),
    TriviaAttempt.distinct('userId', match),
  ]);

  return {
    weeklyAttempts: attemptCount,
    activeUsers7d: activeUsers.length,
  };
}

async function getPreferenceWeight(category, subDomain) {
  const activities = await UserActivity.find(
    { 'categories.category': category, 'categories.subDomain': subDomain },
    { categories: 1 }
  ).lean();

  let weight = 0;
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  for (const activity of activities) {
    for (const entry of activity.categories || []) {
      if (entry.category !== category) continue;
      if (entry.subDomain !== subDomain) continue;
      const recencyBoost = entry.lastPlayed && now - new Date(entry.lastPlayed).getTime() <= sevenDaysMs
        ? 2
        : 0;
      weight += (entry.count || 0) + recencyBoost;
    }
  }

  return weight;
}

function computeHotScore(metrics) {
  return (
    metrics.weeklyAttempts * 1.0
    + metrics.activeUsers7d * 5
    + metrics.preferenceWeight * 2
    + metrics.exhaustedUserCount * 20
  );
}

function computeGenerationTarget(metrics) {
  const { bankSize, maxUserCoverage, activeUsers7d, avgSessionsPerUser } = metrics;
  if (bankSize === 0) return envNumber('CRON_EMPTY_BATCH', 50);

  const projectedFreshNeeded = activeUsers7d * avgSessionsPerUser * envNumber('FRESH_SLOTS_PER_QUIZ', 7);
  const remainingFreshPool = Math.max(0, bankSize - maxUserCoverage);
  let target = Math.max(0, Math.ceil(projectedFreshNeeded - remainingFreshPool));

  if (bankSize > 0 && maxUserCoverage / bankSize >= USER_EXHAUSTION_RATIO) {
    target = Math.max(target, envNumber('CRON_CRITICAL_BATCH', 40));
  }

  if (remainingFreshPool < 10) {
    target = Math.max(target, envNumber('CRON_WARM_BATCH', 10));
  }

  return Math.min(target, envNumber('MAX_WEEKLY_PER_SUBDOMAIN', 50));
}

function assignTier(metrics, hotThreshold) {
  if (metrics.bankSize === 0) return 'empty';

  const coverageRatio = metrics.bankSize > 0 ? metrics.maxUserCoverage / metrics.bankSize : 0;
  const remainingFreshPool = Math.max(0, metrics.bankSize - metrics.maxUserCoverage);

  if (coverageRatio >= USER_EXHAUSTION_RATIO || remainingFreshPool < 10) {
    return 'critical';
  }

  if (metrics.weeklyAttempts === 0 && metrics.preferenceWeight === 0) {
    return 'cold';
  }

  if (metrics.hotScore >= hotThreshold) {
    return 'hot';
  }

  return 'warm';
}

function tierToBatchSize(tier, generationTarget) {
  if (tier === 'empty') return envNumber('CRON_EMPTY_BATCH', 50);
  if (tier === 'critical') return Math.max(generationTarget, envNumber('CRON_CRITICAL_BATCH', 40));
  if (tier === 'hot') return Math.max(generationTarget, envNumber('CRON_HOT_BATCH', 20));
  if (tier === 'warm') return Math.max(generationTarget, envNumber('CRON_WARM_BATCH', 10));
  return 0;
}

async function computeSubDomainDemandMetrics(category, subDomain, since) {
  const bankSize = await getBankSize(category, subDomain);
  const { maxUserCoverage, exhaustedUserCount } = await getUserCoverageMetrics(
    category,
    subDomain,
    bankSize
  );
  const { weeklyAttempts, activeUsers7d } = await getWeeklyAttemptMetrics(category, subDomain, since);
  const preferenceWeight = await getPreferenceWeight(category, subDomain);
  const avgSessionsPerUser = activeUsers7d > 0
    ? weeklyAttempts / activeUsers7d
    : 0;

  const base = {
    category,
    subDomain,
    bankSize,
    maxUserCoverage,
    exhaustedUserCount,
    weeklyAttempts,
    activeUsers7d,
    preferenceWeight,
    avgSessionsPerUser,
  };

  const hotScore = computeHotScore(base);
  const generationTarget = computeGenerationTarget({ ...base, hotScore });

  return {
    ...base,
    hotScore,
    generationTarget,
  };
}

async function buildDemandSnapshots({ now = new Date(), cronRunId = null } = {}) {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekNumber = getISOWeekNumber(now);
  const runId = cronRunId || `cron-${weekNumber}-${now.getTime()}`;
  const pairs = listCanonicalPairs();

  const metricsList = await Promise.all(
    pairs.map(({ category, subDomain }) => computeSubDomainDemandMetrics(category, subDomain, since))
  );

  const activeScores = metricsList
    .filter((m) => m.bankSize > 0 && (m.weeklyAttempts > 0 || m.preferenceWeight > 0))
    .map((m) => m.hotScore)
    .sort((a, b) => b - a);
  const hotThreshold = activeScores.length > 0
    ? activeScores[Math.floor(activeScores.length * 0.2)] || activeScores[0]
    : Infinity;

  return metricsList.map((metrics) => {
    const tier = assignTier(metrics, hotThreshold);
    const questionCount = tierToBatchSize(tier, metrics.generationTarget);
    return {
      ...metrics,
      tier,
      questionCount,
      weekNumber,
      cronRunId: runId,
    };
  });
}

module.exports = {
  buildDemandSnapshots,
  computeSubDomainDemandMetrics,
  computeHotScore,
  computeGenerationTarget,
  assignTier,
  tierToBatchSize,
  getISOWeekNumber,
  USER_EXHAUSTION_RATIO,
};

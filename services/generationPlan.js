const SubDomainDemandSnapshot = require('../models/SubDomainDemandSnapshot');
const { buildDemandSnapshots } = require('./subDomainDemand');

function getMaxWeeklyTotalQuestions() {
  return Number(process.env.MAX_WEEKLY_TOTAL_QUESTIONS || 500);
}

const TIER_PRIORITY = {
  empty: 1,
  critical: 2,
  hot: 3,
  warm: 4,
  cold: 5,
};

async function buildGenerationPlan({ now = new Date(), cronRunId = null } = {}) {
  const snapshots = await buildDemandSnapshots({ now, cronRunId });

  const eligible = snapshots
    .filter((entry) => entry.tier !== 'cold' && entry.questionCount > 0)
    .sort((a, b) => {
      const tierDiff = TIER_PRIORITY[a.tier] - TIER_PRIORITY[b.tier];
      if (tierDiff !== 0) return tierDiff;
      return b.hotScore - a.hotScore;
    });

  const plan = [];
  let totalPlanned = 0;

  for (const entry of eligible) {
    const maxWeeklyTotal = getMaxWeeklyTotalQuestions();
    if (totalPlanned >= maxWeeklyTotal) break;

    const remainingBudget = maxWeeklyTotal - totalPlanned;
    const questionCount = Math.min(entry.questionCount, remainingBudget);
    if (questionCount <= 0) continue;

    plan.push({
      category: entry.category,
      subDomain: entry.subDomain,
      domain: entry.subDomain,
      questionCount,
      tier: entry.tier,
      hotScore: entry.hotScore,
      generationTarget: entry.generationTarget,
      cronRunId: entry.cronRunId,
      weekNumber: entry.weekNumber,
      snapshotMetrics: entry,
    });

    totalPlanned += questionCount;
  }

  await SubDomainDemandSnapshot.insertMany(
    snapshots.map((entry) => ({
      category: entry.category,
      subDomain: entry.subDomain,
      weekNumber: entry.weekNumber,
      cronRunId: entry.cronRunId,
      bankSize: entry.bankSize,
      maxUserCoverage: entry.maxUserCoverage,
      exhaustedUserCount: entry.exhaustedUserCount,
      weeklyAttempts: entry.weeklyAttempts,
      activeUsers7d: entry.activeUsers7d,
      preferenceWeight: entry.preferenceWeight,
      avgSessionsPerUser: entry.avgSessionsPerUser,
      hotScore: entry.hotScore,
      generationTarget: entry.generationTarget,
      tier: entry.tier,
    })),
    { ordered: false }
  ).catch((err) => {
    if (err?.code !== 11000) throw err;
  });

  return {
    plan,
    snapshots,
    totalPlanned,
    tierBreakdown: plan.reduce((acc, item) => {
      acc[item.tier] = (acc[item.tier] || 0) + 1;
      return acc;
    }, {}),
  };
}

async function markSnapshotFulfilled({
  category,
  subDomain,
  cronRunId,
  questionsGenerated,
  fulfilledAt = new Date(),
}) {
  await SubDomainDemandSnapshot.updateOne(
    { category, subDomain, cronRunId },
    {
      $set: {
        questionsGenerated,
        fulfilledAt,
      },
    }
  );
}

module.exports = {
  buildGenerationPlan,
  markSnapshotFulfilled,
  getMaxWeeklyTotalQuestions,
};

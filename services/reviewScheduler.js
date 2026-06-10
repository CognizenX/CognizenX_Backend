/**
 * Spaced review intervals for wrong answers (stepped schedule).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const REVIEW_INTERVALS_DAYS = {
  1: 1,
  2: 3,
  default: 7,
};

function getReviewIntervalDays(wrongStreak) {
  if (wrongStreak <= 1) return REVIEW_INTERVALS_DAYS[1];
  if (wrongStreak === 2) return REVIEW_INTERVALS_DAYS[2];
  return REVIEW_INTERVALS_DAYS.default;
}

function computeNextReviewAt(wrongStreak, fromDate = new Date()) {
  const days = getReviewIntervalDays(wrongStreak);
  return new Date(fromDate.getTime() + days * MS_PER_DAY);
}

function isDueForReview(stats, now = new Date()) {
  if (!stats) return false;
  if (stats.lastResultCorrect === true || stats.masteredAt) return false;
  if (!stats.nextReviewAt) {
    return stats.lastResultCorrect === false;
  }
  return new Date(stats.nextReviewAt) <= now;
}

function isMastered(stats) {
  if (!stats) return false;
  return stats.lastResultCorrect === true || Boolean(stats.masteredAt);
}

module.exports = {
  computeNextReviewAt,
  getReviewIntervalDays,
  isDueForReview,
  isMastered,
  FRESH_SLOTS_RATIO: Number(process.env.FRESH_SLOTS_RATIO || 0.7),
};

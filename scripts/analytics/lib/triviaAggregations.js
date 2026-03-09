const TriviaAttempt = require("../../../models/TriviaAttempt");

function toDateOnlyUtcString(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function buildMatch({ since, until } = {}) {
  const match = {};
  if (since || until) {
    match.attemptedAt = {};
    if (since) match.attemptedAt.$gte = since;
    if (until) match.attemptedAt.$lt = until;
  }
  return match;
}

async function buildDailyTopicMetrics({ since, until } = {}) {
  const match = buildMatch({ since, until });

  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: {
          date: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$attemptedAt",
              timezone: "UTC",
            },
          },
          category: "$category",
          subDomain: "$subDomain",
        },
        attempts: { $sum: 1 },
        correct: { $sum: { $cond: ["$isCorrect", 1, 0] } },
        avgTimeMs: { $avg: "$timeTakenMs" },
        users: { $addToSet: "$userId" },
      },
    },
    {
      $project: {
        _id: 0,
        date: "$_id.date",
        category: "$_id.category",
        subDomain: "$_id.subDomain",
        attempts: 1,
        correct: 1,
        accuracy: {
          $cond: [
            { $eq: ["$attempts", 0] },
            0,
            { $divide: ["$correct", "$attempts"] },
          ],
        },
        avgTimeMs: { $ifNull: ["$avgTimeMs", 0] },
        uniqueUsers: { $size: "$users" },
      },
    },
    { $sort: { date: 1, category: 1, subDomain: 1 } },
  ];

  const results = await TriviaAttempt.aggregate(pipeline);

  // Normalize numeric output a bit for CSV readability.
  return results.map((r) => ({
    ...r,
    accuracy: Number(r.accuracy.toFixed(6)),
    avgTimeMs: Math.round(r.avgTimeMs),
  }));
}

module.exports = {
  buildDailyTopicMetrics,
  // exported for tests
  toDateOnlyUtcString,
};

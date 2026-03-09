const mongoose = require("mongoose");

const User = require("../models/User");
const TriviaAttempt = require("../models/TriviaAttempt");
const { buildDailyTopicMetrics } = require("../scripts/analytics/lib/triviaAggregations");

require("./setup");

describe("analytics extraction", () => {

  it("buildDailyTopicMetrics aggregates attempts per day/topic", async () => {
    const user1 = await User.create({
      name: "A",
      email: "a@example.com",
      password: "hash",
    });
    const user2 = await User.create({
      name: "B",
      email: "b@example.com",
      password: "hash",
    });

    await TriviaAttempt.create([
      {
        userId: user1._id,
        questionId: new mongoose.Types.ObjectId(),
        category: "Memory",
        subDomain: "Short-term",
        selectedAnswer: "A",
        isCorrect: true,
        timeTakenMs: 1200,
        attemptedAt: new Date("2026-03-01T10:00:00.000Z"),
      },
      {
        userId: user1._id,
        questionId: new mongoose.Types.ObjectId(),
        category: "Memory",
        subDomain: "Short-term",
        selectedAnswer: "B",
        isCorrect: false,
        timeTakenMs: 800,
        attemptedAt: new Date("2026-03-01T12:00:00.000Z"),
      },
      {
        userId: user2._id,
        questionId: new mongoose.Types.ObjectId(),
        category: "Memory",
        subDomain: "Short-term",
        selectedAnswer: "C",
        isCorrect: true,
        timeTakenMs: 1000,
        attemptedAt: new Date("2026-03-01T14:00:00.000Z"),
      },
      {
        userId: user2._id,
        questionId: new mongoose.Types.ObjectId(),
        category: "Attention",
        subDomain: "Focus",
        selectedAnswer: "A",
        isCorrect: true,
        timeTakenMs: 2000,
        attemptedAt: new Date("2026-03-02T09:00:00.000Z"),
      },
    ]);

    const rows = await buildDailyTopicMetrics({
      since: new Date("2026-03-01T00:00:00.000Z"),
      until: new Date("2026-03-03T00:00:00.000Z"),
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: "2026-03-01",
          category: "Memory",
          subDomain: "Short-term",
          attempts: 3,
          correct: 2,
          uniqueUsers: 2,
        }),
        expect.objectContaining({
          date: "2026-03-02",
          category: "Attention",
          subDomain: "Focus",
          attempts: 1,
          correct: 1,
          uniqueUsers: 1,
        }),
      ])
    );

    const memory = rows.find(
      (r) => r.date === "2026-03-01" && r.category === "Memory"
    );
    expect(memory.accuracy).toBeCloseTo(2 / 3, 6);
  });
});

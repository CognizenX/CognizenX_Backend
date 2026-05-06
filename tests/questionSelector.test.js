const mongoose = require("mongoose");

const TriviaCategory = require("../models/TriviaCategory");
const UserQuestionStats = require("../models/UserQuestionStats");
const QuestionSelector = require("../services/questionSelector");

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function buildQuestions(count, subDomain) {
  return Array.from({ length: count }, (_, idx) => ({
    question: `Question ${idx + 1}`,
    options: ["A", "B", "C", "D"],
    correctAnswer: "A",
    subDomain,
  }));
}

async function seedCategory({ category, subDomain, count }) {
  const trivia = await TriviaCategory.create({
    category,
    subDomain,
    questions: buildQuestions(count, subDomain),
  });

  return trivia.questions.map((q) => q._id);
}

async function seedStats({ userId, category, subDomain, questionIds, correctCount, incorrectCount, lastCorrectAt }) {
  if (!questionIds || questionIds.length === 0) return [];

  const docs = questionIds.map((questionId) => ({
    userId,
    questionId,
    category,
    subDomain,
    attemptCount: (correctCount || 0) + (incorrectCount || 0),
    correctCount: correctCount || 0,
    incorrectCount: incorrectCount || 0,
    lastCorrectAt: lastCorrectAt ?? null,
    lastAttemptedAt: new Date(),
    lastResultCorrect: correctCount > 0 ? true : incorrectCount > 0 ? false : null,
  }));

  return UserQuestionStats.insertMany(docs);
}

function countOverlap(sessionIds, targetIds) {
  const target = new Set((targetIds || []).map((id) => String(id)));
  return sessionIds.filter((id) => target.has(String(id))).length;
}

describe("QuestionSelector.buildSession", () => {
  test("returns 3 wrong + 3 correct + 4 unseen when pools available", async () => {
    const userId = new mongoose.Types.ObjectId();
    const category = "history";
    const subDomain = "Ancient";

    const questionIds = await seedCategory({ category, subDomain, count: 10 });
    const wrongIds = questionIds.slice(0, 3);
    const correctIds = questionIds.slice(3, 6);
    const unseenIds = questionIds.slice(6);

    await seedStats({ userId, category, subDomain, questionIds: wrongIds, incorrectCount: 2 });
    await seedStats({
      userId,
      category,
      subDomain,
      questionIds: correctIds,
      correctCount: 2,
      lastCorrectAt: daysAgo(3),
    });

    const session = await QuestionSelector.buildSession(userId, category, subDomain);
    const sessionIds = session.map((q) => String(q._id));

    expect(session).toHaveLength(10);
    expect(countOverlap(sessionIds, wrongIds)).toBe(3);
    expect(countOverlap(sessionIds, correctIds)).toBe(3);
    expect(countOverlap(sessionIds, unseenIds)).toBe(4);
  });

  test("returns 0 wrong + 3 correct + 7 unseen when no wrong history", async () => {
    const userId = new mongoose.Types.ObjectId();
    const category = "science";
    const subDomain = "Physics";

    const questionIds = await seedCategory({ category, subDomain, count: 10 });
    const correctIds = questionIds.slice(0, 3);
    const unseenIds = questionIds.slice(3);

    await seedStats({
      userId,
      category,
      subDomain,
      questionIds: correctIds,
      correctCount: 1,
      lastCorrectAt: daysAgo(4),
    });

    const session = await QuestionSelector.buildSession(userId, category, subDomain);
    const sessionIds = session.map((q) => String(q._id));

    expect(session).toHaveLength(10);
    expect(countOverlap(sessionIds, correctIds)).toBe(3);
    expect(countOverlap(sessionIds, unseenIds)).toBe(7);
  });

  test("returns 3 wrong + 0 correct + 7 unseen when correct answers are within 2 days", async () => {
    const userId = new mongoose.Types.ObjectId();
    const category = "geography";
    const subDomain = "World";

    const questionIds = await seedCategory({ category, subDomain, count: 13 });
    const wrongIds = questionIds.slice(0, 3);
    const recentCorrectIds = questionIds.slice(3, 6);
    const unseenIds = questionIds.slice(6);

    await seedStats({ userId, category, subDomain, questionIds: wrongIds, incorrectCount: 1 });
    await seedStats({
      userId,
      category,
      subDomain,
      questionIds: recentCorrectIds,
      correctCount: 1,
      lastCorrectAt: daysAgo(1),
    });

    const session = await QuestionSelector.buildSession(userId, category, subDomain);
    const sessionIds = session.map((q) => String(q._id));

    expect(session).toHaveLength(10);
    expect(countOverlap(sessionIds, wrongIds)).toBe(3);
    expect(countOverlap(sessionIds, recentCorrectIds)).toBe(0);
    expect(countOverlap(sessionIds, unseenIds)).toBe(7);
  });

  test("returns 10 unseen for a new user", async () => {
    const userId = new mongoose.Types.ObjectId();
    const category = "literature";
    const subDomain = "Classics";

    const questionIds = await seedCategory({ category, subDomain, count: 10 });

    const session = await QuestionSelector.buildSession(userId, category, subDomain);
    const sessionIds = session.map((q) => String(q._id));

    expect(session).toHaveLength(10);
    expect(countOverlap(sessionIds, questionIds)).toBe(10);
  });

  test("returns all available questions when the bank is smaller than 10", async () => {
    const userId = new mongoose.Types.ObjectId();
    const category = "music";
    const subDomain = "Jazz";

    const questionIds = await seedCategory({ category, subDomain, count: 6 });

    const session = await QuestionSelector.buildSession(userId, category, subDomain);
    const sessionIds = session.map((q) => String(q._id));

    expect(session).toHaveLength(6);
    expect(countOverlap(sessionIds, questionIds)).toBe(6);
  });

  test("excludes null lastCorrectAt entries from the correct pool", async () => {
    const userId = new mongoose.Types.ObjectId();
    const category = "art";
    const subDomain = "Renaissance";

    const questionIds = await seedCategory({ category, subDomain, count: 13 });
    const nullCorrectIds = questionIds.slice(0, 3);
    const unseenIds = questionIds.slice(3);

    await seedStats({
      userId,
      category,
      subDomain,
      questionIds: nullCorrectIds,
      correctCount: 2,
      lastCorrectAt: null,
    });

    const session = await QuestionSelector.buildSession(userId, category, subDomain);
    const sessionIds = session.map((q) => String(q._id));

    expect(session).toHaveLength(10);
    expect(countOverlap(sessionIds, nullCorrectIds)).toBe(0);
    expect(countOverlap(sessionIds, unseenIds)).toBe(10);
  });

  test("stats from other subDomains do not affect selection for this subDomain", async () => {
    const userId = new mongoose.Types.ObjectId();
    const category = "history";
    const subDomainA = "Ancient";
    const subDomainB = "Medieval";

    // Seed questions for both subDomains
    const questionIdsA = await seedCategory({ category, subDomain: subDomainA, count: 10 });
    const questionIdsB = await seedCategory({ category, subDomain: subDomainB, count: 10 });

    // Seed wrong stats under subDomainB only
    await seedStats({
      userId,
      category,
      subDomain: subDomainB,
      questionIds: questionIdsB.slice(0, 3),
      incorrectCount: 5,
    });

    // Build session for subDomainA — should be all unseen, not affected by subDomainB stats
    const session = await QuestionSelector.buildSession(userId, category, subDomainA);
    const sessionIds = session.map((q) => String(q._id));

    expect(session).toHaveLength(10);
    expect(countOverlap(sessionIds, questionIdsB)).toBe(0); // no bleed-over from subDomainB
    expect(countOverlap(sessionIds, questionIdsA)).toBe(10); // all from subDomainA
  });
});

const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../app");
const User = require("../models/User");
const UserActivity = require("../models/UserActivity");
const TriviaAttempt = require("../models/TriviaAttempt");
const UserQuestionStats = require("../models/UserQuestionStats");
const GameSession = require("../models/GameSession");
const Report = require("../models/Report");
const { countUserLinkedData } = require("../services/deleteUserCascade");

describe("P0.9 DELETE /api/auth/delete-account cascade", () => {
  it("hard-deletes the user and all linked behavioural rows", async () => {
    const sessionToken = `delete-cascade-${Date.now()}`;
    const user = await User.create({
      name: "Delete Me",
      email: `delete.${Date.now()}@example.com`,
      password: "hashed",
      age: 70,
      gender: "female",
      countryOfOrigin: "IN",
      highestEducationLevel: "bachelor_degree",
      sessionToken,
      tokenExpiresAt: null,
      analyticsConsent: false,
    });

    const questionId = new mongoose.Types.ObjectId();
    await TriviaAttempt.create({
      userId: user._id,
      questionId,
      category: "history",
      subDomain: "Modern India",
      selectedAnswer: "1947",
      isCorrect: true,
      timeTakenMs: 1200,
    });
    await UserQuestionStats.create({
      userId: user._id,
      questionId,
      category: "history",
      subDomain: "Modern India",
      attemptCount: 1,
      correctCount: 1,
    });
    await GameSession.create({
      userId: user._id,
      gameId: "memory-match",
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 5000,
      score: 3,
    });
    await Report.create({
      userId: user._id,
      questionId: String(questionId),
      category: "history",
      subDomain: "Modern India",
      notes: "test report",
      questionText: "When did India gain independence?",
      userAnswer: "1947",
    });
    await UserActivity.create({
      userId: user._id,
      categories: [{ category: "history", subDomain: "Modern India", count: 1 }],
    });

    const before = await countUserLinkedData(user._id);
    expect(before.triviaattempts).toBe(1);
    expect(before.userquestionstats).toBe(1);
    expect(before.gamesessions).toBe(1);
    expect(before.reports).toBe(1);
    expect(before.useractivities).toBe(1);
    expect(before.users).toBe(1);

    const res = await request(app)
      .delete("/api/auth/delete-account")
      .set("Authorization", `Bearer ${sessionToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
    expect(res.body.deleted.users).toBe(1);
    expect(res.body.deleted.triviaattempts).toBe(1);
    expect(res.body.deleted.userquestionstats).toBe(1);
    expect(res.body.deleted.gamesessions).toBe(1);
    expect(res.body.deleted.reports).toBe(1);
    expect(res.body.deleted.useractivities).toBe(1);

    const after = await countUserLinkedData(user._id);
    expect(after).toEqual({
      triviaattempts: 0,
      userquestionstats: 0,
      gamesessions: 0,
      reports: 0,
      useractivities: 0,
      users: 0,
    });
  });
});

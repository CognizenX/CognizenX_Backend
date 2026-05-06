const request = require("supertest");
const app = require("../app");

const User = require("../models/User");
const TriviaCategory = require("../models/TriviaCategory");
const UserQuestionStats = require("../models/UserQuestionStats");

require("./setup");

describe("Trivia attempts + daily metrics", () => {
  test("records an attempt and aggregates daily metrics", async () => {
    const sessionToken = "test-token";

    const user = await User.create({
      name: "Test",
      email: "test@example.com",
      password: "hashed",
      age: 30,
      gender: "female",
      countryOfOrigin: "US",
      yearsOfEducation: 16,
      sessionToken,
      tokenExpiresAt: null,
    });

    const trivia = await TriviaCategory.create({
      category: "history",
      subDomain: "Modern India",
      questions: [
        {
          question: "Who was the first Prime Minister of India?",
          options: ["Nehru", "Gandhi"],
          correctAnswer: "Nehru",
          subDomain: "Modern India",
        },
      ],
    });

    const questionId = trivia.questions[0]._id.toString();

    const attemptRes = await request(app)
      .post("/api/trivia/attempts")
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({ questionId, selectedAnswer: "Nehru", timeTakenMs: 1234 })
      .expect(201);

    expect(attemptRes.body.status).toBe("success");
    expect(attemptRes.body.isCorrect).toBe(true);

    const metricsRes = await request(app)
      .get("/api/trivia/metrics/daily?days=3")
      .set("Authorization", `Bearer ${sessionToken}`)
      .expect(200);

    expect(metricsRes.body.status).toBe("success");
    expect(metricsRes.body.series.length).toBeGreaterThanOrEqual(1);

    const day = metricsRes.body.series[0];
    expect(day.totalAttempts).toBe(1);
    expect(day.correctCount).toBe(1);
    expect(day.incorrectCount).toBe(0);
    expect(day.avgTimeTakenMs).toBe(1234);
  });

  test("sets lastCorrectAt only on correct answers", async () => {
    const sessionToken = "stats-token";

    const user = await User.create({
      name: "Stats",
      email: "stats@example.com",
      password: "hashed",
      age: 28,
      gender: "male",
      countryOfOrigin: "US",
      yearsOfEducation: 16,
      sessionToken,
      tokenExpiresAt: null,
    });

    const trivia = await TriviaCategory.create({
      category: "history",
      subDomain: "Modern India",
      questions: [
        {
          question: "Who was the first Prime Minister of India?",
          options: ["Nehru", "Gandhi"],
          correctAnswer: "Nehru",
          subDomain: "Modern India",
        },
      ],
    });

    const questionId = trivia.questions[0]._id.toString();

    await request(app)
      .post("/api/trivia/attempts")
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({ questionId, selectedAnswer: "Nehru", timeTakenMs: 900 })
      .expect(201);

    let stats = await UserQuestionStats.findOne({
      userId: user._id,
      questionId: trivia.questions[0]._id,
    });

    expect(stats).toBeTruthy();
    const firstCorrectAt = stats.lastCorrectAt.getTime();

    await request(app)
      .post("/api/trivia/attempts")
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({ questionId, selectedAnswer: "Gandhi", timeTakenMs: 800 })
      .expect(201);

    stats = await UserQuestionStats.findOne({
      userId: user._id,
      questionId: trivia.questions[0]._id,
    });

    expect(stats.lastCorrectAt.getTime()).toBe(firstCorrectAt);
    expect(stats.lastResultCorrect).toBe(false);
  });
});

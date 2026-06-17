const request = require("supertest");
const app = require("../app");

const User = require("../models/User");
const GameSession = require("../models/GameSession");

describe("Game sessions + metrics", () => {
  test("records a session and aggregates daily metrics", async () => {
    const sessionToken = "game-test-token";

    await User.create({
      name: "Game Tester",
      email: "gametester@example.com",
      password: "hashed",
      age: 65,
      gender: "female",
      countryOfOrigin: "US",
      highestEducationLevel: "high_school_ged",
      sessionToken,
      tokenExpiresAt: null,
    });

    const startedAt = new Date().toISOString();
    const completedAt = new Date().toISOString();

    const sessionRes = await request(app)
      .post("/api/games/sessions")
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({
        gameId: "memory_match",
        cognitiveDomains: ["memory", "attention"],
        difficulty: "easy",
        startedAt,
        completedAt,
        durationMs: 180000,
        score: 100,
        moves: 12,
        completed: true,
        metrics: { pairsMatched: 4 },
      })
      .expect(201);

    expect(sessionRes.body.status).toBe("success");
    expect(sessionRes.body.sessionId).toBeTruthy();

    const metricsRes = await request(app)
      .get("/api/games/metrics/daily?days=3")
      .set("Authorization", `Bearer ${sessionToken}`)
      .expect(200);

    expect(metricsRes.body.status).toBe("success");
    expect(metricsRes.body.series.length).toBe(3);

    const today = metricsRes.body.series.find((row) => row.totalSessions > 0);
    expect(today).toBeTruthy();
    expect(today.totalSessions).toBe(1);
    expect(today.completedSessions).toBe(1);
    expect(today.totalDurationMs).toBe(180000);

    const summaryRes = await request(app)
      .get("/api/games/metrics/summary")
      .set("Authorization", `Bearer ${sessionToken}`)
      .expect(200);

    expect(summaryRes.body.status).toBe("success");
    expect(summaryRes.body.totalSessions).toBe(1);
    expect(summaryRes.body.favoriteGameId).toBe("memory_match");
    expect(summaryRes.body.sessionsThisWeek).toBe(1);
  });

  test("rejects session without auth token", async () => {
    await request(app)
      .post("/api/games/sessions")
      .send({
        gameId: "memory_match",
        startedAt: new Date().toISOString(),
      })
      .expect(401);
  });

  test("rejects invalid session payload", async () => {
    const sessionToken = "game-invalid-token";

    await User.create({
      name: "Invalid",
      email: "invalid@example.com",
      password: "hashed",
      age: 65,
      gender: "male",
      countryOfOrigin: "US",
      highestEducationLevel: "high_school_ged",
      sessionToken,
      tokenExpiresAt: null,
    });

    await request(app)
      .post("/api/games/sessions")
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({ gameId: "memory_match" })
      .expect(400);
  });
});

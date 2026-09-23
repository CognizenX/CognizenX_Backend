const request = require("supertest");
const app = require("../app");
const User = require("../models/User");
const TriviaCategory = require("../models/TriviaCategory");

async function createUser({ email, role = "user", sessionToken }) {
  return User.create({
    name: role === "admin" ? "Admin User" : "Normal User",
    email,
    password: "hashed",
    age: 70,
    gender: "male",
    countryOfOrigin: "IN",
    highestEducationLevel: "bachelor_degree",
    role,
    sessionToken,
    tokenExpiresAt: null,
  });
}

describe("P0.1 admin-scoped write / OpenAI routes", () => {
  const userToken = "user-session-token";
  const adminToken = "admin-session-token";

  beforeEach(async () => {
    await createUser({
      email: "user@example.com",
      role: "user",
      sessionToken: userToken,
    });
    await createUser({
      email: "admin@example.com",
      role: "admin",
      sessionToken: adminToken,
    });
  });

  describe("POST /api/add-questions", () => {
    const payload = {
      category: "history",
      subDomain: "Modern India",
      questions: [
        {
          question: "When did India gain independence?",
          options: ["1945", "1947", "1950", "1930"],
          correctAnswer: "1947",
        },
      ],
    };

    test("returns 401 when unauthenticated", async () => {
      const res = await request(app).post("/api/add-questions").send(payload);
      expect(res.statusCode).toBe(401);
    });

    test("returns 403 for a standard user", async () => {
      const res = await request(app)
        .post("/api/add-questions")
        .set("Authorization", `Bearer ${userToken}`)
        .send(payload);
      expect(res.statusCode).toBe(403);
      expect(res.body.message).toMatch(/admin/i);
    });

    test("allows an admin", async () => {
      const res = await request(app)
        .post("/api/add-questions")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(payload);
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
    });
  });

  describe("POST /api/generate-questions", () => {
    const payload = { category: "history", subDomain: "Modern India", count: 1 };

    test("returns 401 when unauthenticated", async () => {
      const res = await request(app).post("/api/generate-questions").send(payload);
      expect(res.statusCode).toBe(401);
    });

    test("returns 403 for a standard user", async () => {
      const res = await request(app)
        .post("/api/generate-questions")
        .set("Authorization", `Bearer ${userToken}`)
        .send(payload);
      expect(res.statusCode).toBe(403);
      expect(res.body.message).toMatch(/admin/i);
    });
  });

  describe("POST /api/generate-explanation", () => {
    const baseBody = {
      question: "When did India gain independence?",
      userAnswer: "1947",
      correctAnswer: "1947",
    };

    test("returns 401 when unauthenticated", async () => {
      const res = await request(app).post("/api/generate-explanation").send(baseBody);
      expect(res.statusCode).toBe(401);
    });

    test("returns 403 for a standard user without questionId lookup", async () => {
      const res = await request(app)
        .post("/api/generate-explanation")
        .set("Authorization", `Bearer ${userToken}`)
        .send(baseBody);
      expect(res.statusCode).toBe(403);
      expect(res.body.message).toMatch(/questionId/i);
    });

    test("returns 403 for a standard user when question is not in the bank", async () => {
      const res = await request(app)
        .post("/api/generate-explanation")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          ...baseBody,
          questionId: "507f1f77bcf86cd799439011",
          category: "history",
          subDomain: "Modern India",
        });
      expect(res.statusCode).toBe(403);
      expect(res.body.message).toMatch(/not found/i);
    });

    test("returns cached explanation for a standard user with a valid bank question", async () => {
      const category = await TriviaCategory.create({
        category: "history",
        subDomain: "Modern India",
        questions: [
          {
            question: baseBody.question,
            options: ["1945", "1947", "1950", "1930"],
            correctAnswer: "1947",
            explanation: "India became independent in 1947.",
          },
        ],
      });
      const questionId = category.questions[0]._id.toString();

      const res = await request(app)
        .post("/api/generate-explanation")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          ...baseBody,
          questionId,
          category: "history",
          subDomain: "Modern India",
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.cached).toBe(true);
      expect(res.body.explanation).toMatch(/1947/);
    });
  });

  describe("GET /api/internal/generate-weekly-questions", () => {
    const previousSecret = process.env.CRON_SECRET;

    afterEach(() => {
      if (previousSecret === undefined) {
        delete process.env.CRON_SECRET;
      } else {
        process.env.CRON_SECRET = previousSecret;
      }
    });

    test("returns 401 without cron bearer token when CRON_SECRET is set", async () => {
      process.env.CRON_SECRET = "test-cron-secret";
      const res = await request(app).get("/api/internal/generate-weekly-questions");
      expect(res.statusCode).toBe(401);
    });

    test("returns 401 for a standard user session token", async () => {
      process.env.CRON_SECRET = "test-cron-secret";
      const res = await request(app)
        .get("/api/internal/generate-weekly-questions")
        .set("Authorization", `Bearer ${userToken}`);
      expect(res.statusCode).toBe(401);
    });
  });
});

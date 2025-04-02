const request = require("supertest");
const app = require("../app");
const Trivia = require("../models/TriviaCategory");

describe("GET /api/questions", () => {
  beforeEach(async () => {
    // Insert a category with questions
    await Trivia.create({
      category: "history",
      domain: "modernIndia",
      questions: [
        {
          question: "Who was the first President of India?",
          options: ["Rajendra Prasad", "Nehru", "Gandhi", "Patel"],
          correctAnswer: "Rajendra Prasad"
        },
        {
          question: "When did India gain independence?",
          options: ["1945", "1947", "1950", "1952"],
          correctAnswer: "1947"
        }
      ]
    });
  });

  it("should return questions for valid category and subDomain", async () => {
    const res = await request(app)
      .get("/api/questions")
      .query({ category: "history", subDomain: "modernIndia" });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.questions).toHaveLength(2);
    expect(res.body.questions[0]).toHaveProperty("question");
    expect(res.body.questions[0]).toHaveProperty("options");
    expect(res.body.questions[0]).toHaveProperty("correctAnswer");
  });

  it("should return 404 if category exists but has no questions", async () => {
    await Trivia.create({
      category: "science",
      domain: "space",
      questions: []
    });

    const res = await request(app)
      .get("/api/questions")
      .query({ category: "science", subDomain: "space" });

    expect(res.statusCode).toBe(404);
    expect(res.body.status).toBe("error");
    expect(res.body.message).toMatch(/no questions/i);
  });

  it("should return 404 if no matching category/domain found", async () => {
    const res = await request(app)
      .get("/api/questions")
      .query({ category: "mythology", subDomain: "greek" });

    expect(res.statusCode).toBe(404);
    expect(res.body.status).toBe("error");
    expect(res.body.message).toMatch(/no questions/i);
  });

  it("should return 400 if missing query parameters", async () => {
    const res = await request(app).get("/api/questions");

    expect(res.statusCode).toBe(400);
    expect(res.body.status).toBe("error");
    expect(res.body.message).toMatch(/required parameters/i);
  });
});

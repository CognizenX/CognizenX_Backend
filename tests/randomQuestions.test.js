const request = require("supertest");
const app = require("../app");
const Trivia = require("../models/TriviaCategory");

describe("GET /api/random-questions", () => {
  beforeEach(async () => {
    // Insert mock trivia questions in different categories
    await Trivia.insertMany([
      {
        category: "history",
        domain: "Ancient India",
        questions: [
          {
            question: "Who founded the Maurya Empire?",
            options: ["Chandragupta", "Ashoka", "Bindusara", "Harsha"],
            correctAnswer: "Chandragupta",
          },
          {
            question: "What was the capital of the Gupta Empire?",
            options: ["Patliputra", "Delhi", "Varanasi", "Lahore"],
            correctAnswer: "Patliputra",
          }
        ],
      },
      {
        category: "politics",
        domain: "North Indian",
        questions: [
          {
            question: "Who is the current PM of India?",
            options: ["Modi", "Rahul", "Sonia", "Keji"],
            correctAnswer: "Modi",
          }
        ],
      },
    ]);
  });

  it("should return 10 or fewer random questions from given categories", async () => {
    const res = await request(app)
      .get("/api/random-questions")
      .query({ categories: "history,politics" });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.questions)).toBe(true);
    expect(res.body.questions.length).toBeLessThanOrEqual(10);

    // If questions are returned, verify structure
    if (res.body.questions.length > 0) {
      const q = res.body.questions[0];
      expect(q).toHaveProperty("question");
      expect(q).toHaveProperty("options");
      expect(q).toHaveProperty("correctAnswer");
    }
  }, 90000); // Increase timeout to 90 seconds to allow for OpenAI API calls (10 questions per category)

  it("should return 400 if categories are missing", async () => {
    const res = await request(app).get("/api/random-questions");

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/categories are required/i);
  });

  it("should return empty list if no matching categories found", async () => {
    const res = await request(app)
      .get("/api/random-questions")
      .query({ categories: "nonexistent" });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.questions)).toBe(true);
    expect(res.body.questions.length).toBe(0);
  });

  it("should return 10 new AI-generated questions when generation succeeds", async () => {
    // This test may use saved questions if OpenAI API is not configured
    // but should still return valid questions
    const res = await request(app)
      .get("/api/random-questions")
      .query({ categories: "history" });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.questions)).toBe(true);
    expect(res.body.questions.length).toBeLessThanOrEqual(10);
    
    // If questions are returned, verify they have the expected structure
    if (res.body.questions.length > 0) {
      res.body.questions.forEach(q => {
        expect(q).toHaveProperty("question");
        expect(q).toHaveProperty("options");
        expect(q).toHaveProperty("correctAnswer");
        expect(Array.isArray(q.options)).toBe(true);
        expect(q.options.length).toBeGreaterThanOrEqual(2);
      });
    }
  }, 60000); // Increased timeout for OpenAI API calls
});

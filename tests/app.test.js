const request = require("supertest")
const app = require("../app")
const Trivia = require("../models/TriviaCategory");



describe("GET /", () => {
    test("should return a welcome message", async () => {
        const res = await request(app).get("/");
        console.log("res.body", res.body)
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty("message", "Backend running on Vercel! Base route /");
    });
})

describe("GET /api", () => {
    test("should return the Vercel backend message", async () => {
      const res = await request(app).get("/api");
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("message", "Backend running on Vercel!");
    });
  });

describe("POST /api/add-questions", () => {
    it("should add new questions and return success response", async () => {
      const payload = {
        category: "history",
        domain: "modernIndia",
        questions: [
          {
            question: "When did India gain independence?",
            options: ["1945", "1947", "1950", "1930"],
            correctAnswer: "1947"
          },
          {
            question: "Who was the first Prime Minister of India?",
            options: ["Mahatma Gandhi", "Nehru", "Patel", "Ambedkar"],
            correctAnswer: "Nehru"
          }
        ]
      };
  
      const res = await request(app).post("/api/add-questions").send(payload);
      console.log(res.body)
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.category).toBe("history");
      expect(res.body.data.questions.length).toBe(2);
    });
});
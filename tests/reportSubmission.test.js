const request = require("supertest");
const app = require("../app");

const User = require("../models/User");
const Report = require("../models/Report");

describe("POST /api/reports", () => {
  test("saves an answer review report for an authenticated user", async () => {
    const sessionToken = "report-token";

    await User.create({
      name: "Reporter",
      email: "reporter@example.com",
      password: "hashed",
      age: 42,
      gender: "female",
      countryOfOrigin: "US",
      highestEducationLevel: "bachelor_degree",
      sessionToken,
      tokenExpiresAt: null,
    });

    const payload = {
      type: "answer_review",
      notes: "The suggested correct answer looks wrong for this question.",
      questionId: "abc123",
      category: "religion",
      subDomain: "Sikhism",
      questionText: "Who founded Sikhism?",
      questionOptions: ["Guru Nanak", "Guru Gobind Singh"],
      suggestedAnswer: "Guru Gobind Singh",
      userAnswer: "Guru Nanak",
      explanationText: "This explanation appears inconsistent.",
      isMarkedCorrect: false,
      questionIndex: 2,
      totalQuestions: 10,
    };

    const response = await request(app)
      .post("/api/reports")
      .set("Authorization", `Bearer ${sessionToken}`)
      .send(payload)
      .expect(201);

    expect(response.body.status).toBe("success");
    expect(response.body.reportId).toBeDefined();

    const report = await Report.findById(response.body.reportId).lean();
    expect(report).toBeTruthy();
    expect(String(report.userId)).toBeDefined();
    expect(report.type).toBe("answer_review");
    expect(report.status).toBe("open");
    expect(report.notes).toBe(payload.notes);
    expect(report.questionText).toBe(payload.questionText);
    expect(report.suggestedAnswer).toBe(payload.suggestedAnswer);
    expect(report.userAnswer).toBe(payload.userAnswer);
    expect(report.category).toBe(payload.category);
    expect(report.subDomain).toBe(payload.subDomain);
  });
});

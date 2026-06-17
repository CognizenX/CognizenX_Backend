const request = require("supertest");

const app = require("../app");

describe("rate limiting", () => {
  it("lets two authenticated users on the same IP both reach protected routes", async () => {
    const password = "TestPass123!";
    const signupPayload = {
      password,
      dob: "1990-01-01",
      gender: "female",
      countryOfOrigin: "US",
      yearsOfEducation: 12,
    };

    const userA = await request(app)
      .post("/api/auth/signup")
      .send({
        ...signupPayload,
        name: "Rate User A",
        email: `rate-a.${Date.now()}@example.com`,
      });
    const userB = await request(app)
      .post("/api/auth/signup")
      .send({
        ...signupPayload,
        name: "Rate User B",
        email: `rate-b.${Date.now()}@example.com`,
      });

    expect(userA.statusCode).toBe(201);
    expect(userB.statusCode).toBe(201);

    const sharedIp = "203.0.113.10";

    const resA = await request(app)
      .get("/api/auth/get-user-id")
      .set("Authorization", `Bearer ${userA.body.sessionToken}`)
      .set("X-Forwarded-For", sharedIp);

    const resB = await request(app)
      .get("/api/auth/get-user-id")
      .set("Authorization", `Bearer ${userB.body.sessionToken}`)
      .set("X-Forwarded-For", sharedIp);

    expect(resA.statusCode).toBe(200);
    expect(resB.statusCode).toBe(200);
    expect(resA.body.userId).not.toBe(resB.body.userId);
  });
});

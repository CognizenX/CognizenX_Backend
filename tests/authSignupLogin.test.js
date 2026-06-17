const request = require("supertest");

const app = require("../app");

describe("Auth diagnostics: signup + login", () => {
  it("signs up then logs in with the same credentials", async () => {
    const email = `user.${Date.now()}@example.com`;
    const password = "TestPass123!";

    const signupRes = await request(app)
      .post("/api/auth/signup")
      .send({
        name: "Test User",
        email,
        password,
        age: 65,
        gender: "female",
        countryOfOrigin: "United States",
        yearsOfEducation: 12,
      });

    expect(signupRes.statusCode).toBe(201);
    expect(signupRes.body).toHaveProperty("sessionToken");
    expect(signupRes.body).toHaveProperty("expiresAt");

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email, password });

    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.body).toHaveProperty("sessionToken");
    expect(loginRes.body).toHaveProperty("expiresAt");
  });

  it("rejects signup when required background fields are missing (matches current mobile UI pre-check)", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        name: "Test User",
        email: `missing-fields.${Date.now()}@example.com`,
        password: "TestPass123!",
        // Frontend currently allows attempting signup without selecting
        // dob/gender/country/years; backend rejects it.
      });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ message: "Validation error" });
    const fields = (res.body.details || []).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(["gender", "countryOfOrigin", "yearsOfEducation"]));
  });

  it("accepts signup names with apostrophes or hyphens", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        name: "O'Connor-Smith",
        email: `punct.${Date.now()}@example.com`,
        password: "TestPass123!",
        age: 70,
        gender: "male",
        countryOfOrigin: "Ireland",
        yearsOfEducation: 16,
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty("sessionToken");
  });

  it("rejects signup when the name contains unsupported punctuation", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        name: "User@123",
        email: `bad-name.${Date.now()}@example.com`,
        password: "TestPass123!",
        age: 70,
        gender: "male",
        countryOfOrigin: "Ireland",
        yearsOfEducation: 16,
      });

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      message: "Validation error",
    });
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.some((d) => d.field === "name")).toBe(true);
  });

  it("shows email case-sensitivity can prevent login", async () => {
    const mixedCaseEmail = `Case.${Date.now()}@Example.com`;
    const password = "TestPass123!";

    const signupRes = await request(app)
      .post("/api/auth/signup")
      .send({
        name: "Case User",
        email: mixedCaseEmail,
        password,
        age: 60,
        gender: "other",
        countryOfOrigin: "Canada",
        yearsOfEducation: 14,
      });

    expect(signupRes.statusCode).toBe(201);

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: mixedCaseEmail.toLowerCase(), password });

    expect(loginRes.statusCode).toBe(401);
    expect(loginRes.body).toMatchObject({ message: "Invalid credentials" });
  });

  it("rejects login when the email has leading/trailing whitespace", async () => {
    const email = `space.${Date.now()}@example.com`;
    const password = "TestPass123!";

    await request(app)
      .post("/api/auth/signup")
      .send({
        name: "Space User",
        email,
        password,
        age: 55,
        gender: "prefer_not_to_say",
        countryOfOrigin: "US",
        yearsOfEducation: 10,
      })
      .expect(201);

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: ` ${email} `, password });

    expect(loginRes.statusCode).toBe(400);
    expect(loginRes.body).toMatchObject({ message: "Validation error" });
    expect(loginRes.body.details.some((d) => d.field === "email")).toBe(true);
  });
});

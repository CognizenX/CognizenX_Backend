const request = require("supertest");
const bcrypt = require("bcryptjs");

const app = require("../app");
const User = require("../models/User");

describe("POST /api/auth/login (legacy users)", () => {
  it("allows login for a user missing newer background fields", async () => {
    const email = "legacy@login.com";
    const password = "legacy-pass-123";

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      name: "Legacy User",
      email,
      password: hashedPassword,
      // Intentionally omit: age, gender, countryOfOrigin, yearsOfEducation
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("sessionToken");
    expect(typeof res.body.sessionToken).toBe("string");
    expect(res.body.sessionToken.length).toBeGreaterThan(10);
    expect(res.body).toHaveProperty("expiresAt");

    const updatedUser = await User.findOne({ email });
    expect(updatedUser).toBeTruthy();
    expect(updatedUser.sessionToken).toBe(res.body.sessionToken);
  });
});

const request = require("supertest");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const app = require("../app");
const User = require("../models/User");

describe("analytics consent (P0.3)", () => {
  test("GET /api/users/me includes analyticsConsent and isInternal", async () => {
    const password = await bcrypt.hash("password123", 10);
    const sessionToken = crypto.randomBytes(16).toString("hex");
    const user = await User.create({
      name: "Consent User",
      email: "consent-user@example.com",
      password,
      gender: "prefer_not_to_say",
      countryOfOrigin: "US",
      highestEducationLevel: "bachelor_degree",
      sessionToken,
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      analyticsConsent: true,
      isInternal: true,
    });

    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${sessionToken}`)
      .expect(200);

    expect(res.body.user.id).toBe(String(user._id));
    expect(res.body.user.analyticsConsent).toBe(true);
    expect(res.body.user.isInternal).toBe(true);
  });

  test("PATCH /api/users/me can update analyticsConsent", async () => {
    const password = await bcrypt.hash("password123", 10);
    const sessionToken = crypto.randomBytes(16).toString("hex");
    await User.create({
      name: "Consent Patch",
      email: "consent-patch@example.com",
      password,
      gender: "prefer_not_to_say",
      countryOfOrigin: "IN",
      highestEducationLevel: "master_degree",
      sessionToken,
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      analyticsConsent: false,
    });

    const res = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({ analyticsConsent: true })
      .expect(200);

    expect(res.body.user.analyticsConsent).toBe(true);

    const stored = await User.findOne({ email: "consent-patch@example.com" });
    expect(stored.analyticsConsent).toBe(true);
  });
});

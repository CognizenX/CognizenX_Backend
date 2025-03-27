const request = require("supertest");
const app = require("../app")
const mongoose = require("mongoose");
const User = require("../models/User");
const UserActivity = require("../models/UserActivity");

describe("GET /api/user-preferences", () => {
  let token;
  let userId;

  beforeEach(async () => {
    // Create a mock user
    const user = await User.create({
      name: "Test User",
      email: "test@example.com",
      password: "hashedpassword", // doesn't matter for this test
      sessionToken: "test-token-123"
    });

    userId = user._id;
    token = user.sessionToken;

    // Insert activity for that user
    await UserActivity.create({
      userId: userId,
      categories: [
        { category: "history", domain: "modernIndia", count: 5 },
        { category: "geography", domain: "riversAndMountains", count: 3 },
        { category: "mythology", domain: "hindu", count: 7 }
      ]
    });
  });

  it("should return sorted user preferences", async () => {
    const res = await request(app)
      .get("/api/user-preferences")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.preferences).toBeDefined();
    expect(res.body.preferences.length).toBe(3);
    expect(res.body.preferences[0].category).toBe("mythology"); // highest count
    expect(res.body.preferences[1].category).toBe("history");
    expect(res.body.preferences[2].category).toBe("geography");
  });

  it("should return empty preferences if user has no activity", async () => {
    // Clear existing activity
    await UserActivity.deleteMany({});

    const res = await request(app)
      .get("/api/user-preferences")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.preferences).toEqual([]);
  });

  it("should return 401 if no token provided", async () => {
    const res = await request(app).get("/api/user-preferences");
    expect(res.statusCode).toBe(401);
  });
});

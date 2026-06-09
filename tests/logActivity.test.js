const request = require("supertest");
const app = require("../app");
const User = require("../models/User");
const UserActivity = require("../models/UserActivity");

describe("POST /api/log-activity", () => {
  let token, userId;

  beforeEach(async () => {
    const user = await User.create({
      name: "Activity Tester",
      email: "log@test.com",
      password: "testpass",
      sessionToken: "test-session-token",
    });

    userId = user._id;
    token = user.sessionToken;
  });

  it("should log activity for new category/domain", async () => {
    const res = await request(app)
      .post("/api/log-activity")
      .set("Authorization", `Bearer ${token}`)
      .send({
        category: "history",
        subDomain: "Modern India"
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("success");

    const activity = await UserActivity.findOne({ userId });
    expect(activity).toBeDefined();
    expect(activity.categories.length).toBe(1);
    expect(activity.categories[0].category).toBe("history");
    expect(activity.categories[0].subDomain).toBe("Modern India");
    expect(activity.categories[0].count).toBe(1);
  });

  it("should increment count if same category/domain is logged again", async () => {
    // Pre-insert activity
    await UserActivity.create({
      userId,
      categories: [{
        category: "politics",
        subDomain: "North Indian",
        count: 1
      }]
    });

    const res = await request(app)
      .post("/api/log-activity")
      .set("Authorization", `Bearer ${token}`)
      .send({
        category: "politics",
        subDomain: "North Indian"
      });

    expect(res.statusCode).toBe(200);

    const activity = await UserActivity.findOne({ userId });
    expect(activity.categories.length).toBe(1);
    expect(activity.categories[0].count).toBe(2);
  });

  it("should log activity when subDomain is provided", async () => {
    const res = await request(app)
      .post("/api/log-activity")
      .set("Authorization", `Bearer ${token}`)
      .send({
        category: "science",
        subDomain: "Space"
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("success");

    const activity = await UserActivity.findOne({ userId });
    expect(activity).toBeDefined();
    expect(activity.categories.length).toBe(1);
    expect(activity.categories[0].category).toBe("science");
    expect(activity.categories[0].subDomain).toBe("Space");
    expect(activity.categories[0].count).toBe(1);
  });

  it("should increment count when existing entry matches subDomain payload", async () => {
    await UserActivity.create({
      userId,
      categories: [{
        category: "entertainment",
        subDomain: "Bollywood Movies",
        count: 1
      }]
    });

    const res = await request(app)
      .post("/api/log-activity")
      .set("Authorization", `Bearer ${token}`)
      .send({
        category: "entertainment",
        subDomain: "Bollywood Movies"
      });

    expect(res.statusCode).toBe(200);

    const activity = await UserActivity.findOne({ userId });
    expect(activity.categories.length).toBe(1);
    expect(activity.categories[0].count).toBe(2);
  });

  it("should return 400 if category or domain missing", async () => {
    const res = await request(app)
      .post("/api/log-activity")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "politics" }); // no domain

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  it("should return 401 if no token is provided", async () => {
    const res = await request(app)
      .post("/api/log-activity")
      .send({ category: "history", domain: "Ancient India" });

    expect(res.statusCode).toBe(401);
  });

  it("should accept legacy domain field for backward compatibility", async () => {
    const res = await request(app)
      .post("/api/log-activity")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "history", domain: "Ancient India" });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("success");

    const activity = await UserActivity.findOne({ userId });
    expect(activity.categories.length).toBe(1);
    expect(activity.categories[0].category).toBe("history");
    expect(activity.categories[0].subDomain).toBe("Ancient India");
  });
});

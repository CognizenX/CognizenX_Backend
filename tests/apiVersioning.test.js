const request = require("supertest");

describe("P0.6A API versioning", () => {
  const previousMin = process.env.MIN_SUPPORTED_APP_VERSION;

  beforeEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    if (previousMin == null) delete process.env.MIN_SUPPORTED_APP_VERSION;
    else process.env.MIN_SUPPORTED_APP_VERSION = previousMin;
  });

  test("serves the same health probe on /api and /api/v1 when min version is unset", async () => {
    delete process.env.MIN_SUPPORTED_APP_VERSION;
    const app = require("../app");

    const legacy = await request(app).get("/api");
    expect(legacy.statusCode).toBe(200);
    expect(legacy.body.message).toMatch(/Backend running/);

    const v1 = await request(app).get("/api/v1");
    expect(v1.statusCode).toBe(200);
    expect(v1.body.apiVersion).toBe("v1");
  });

  test("returns FORCE_UPDATE when client version is below the minimum", async () => {
    process.env.MIN_SUPPORTED_APP_VERSION = "3.0.0";
    const app = require("../app");

    const res = await request(app)
      .get("/api/v1/users/me")
      .set("X-App-Version", "2.5.0");

    expect(res.statusCode).toBe(426);
    expect(res.body.code).toBe("FORCE_UPDATE");
    expect(res.body.minSupportedAppVersion).toBe("3.0.0");
  });

  test("allows a client at or above the minimum on a real route", async () => {
    process.env.MIN_SUPPORTED_APP_VERSION = "3.0.0";
    const app = require("../app");

    const res = await request(app)
      .get("/api/v1/users/me")
      .set("X-App-Version", "3.0.0");

    expect(res.statusCode).not.toBe(426);
    expect(res.body.code).not.toBe("FORCE_UPDATE");
  });

  test("exempts internal cron paths from the min-version gate", async () => {
    process.env.MIN_SUPPORTED_APP_VERSION = "3.0.0";
    const app = require("../app");

    const res = await request(app).get("/api/internal/generate-weekly-questions");
    expect(res.body.code).not.toBe("FORCE_UPDATE");
    expect(res.statusCode).not.toBe(426);
  });
});

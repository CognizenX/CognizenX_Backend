const request = require("supertest");

const app = require("../app");
const User = require("../models/User");

describe("/api/users/me profile update", () => {
  test("GET /api/users/me returns current user", async () => {
    const sessionToken = "profile-token-me";

    await User.create({
      name: "Me User",
      email: "me-user@example.com",
      password: "hashed",
      sessionToken,
      tokenExpiresAt: null,
    });

    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${sessionToken}`)
      .expect(200);

    expect(res.body).toHaveProperty("user");
    expect(res.body.user).toHaveProperty("email", "me-user@example.com");
    expect(res.body.user).toHaveProperty("name", "Me User");
    expect(res.body.user).toHaveProperty("id");
  });

  test("legacy user can set dob+gender once and edit other fields", async () => {
    const sessionToken = "profile-token-1";

    const user = await User.create({
      name: "Legacy User",
      email: "legacy-profile@example.com",
      password: "hashed",
      sessionToken,
      tokenExpiresAt: null,
      // Intentionally omit dob, gender, countryOfOrigin, yearsOfEducation
    });

    // Set missing fields (including set-once fields)
    const setRes = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({
        dob: "1960-01-02",
        gender: "female",
        countryOfOrigin: "US",
        yearsOfEducation: 14,
      })
      .expect(200);

    expect(setRes.body).toHaveProperty("user");
    expect(setRes.body.user.dob).toBe("1960-01-02");
    expect(setRes.body.user.gender).toBe("female");
    expect(setRes.body.user.countryOfOrigin).toBe("US");
    expect(setRes.body.user.yearsOfEducation).toBe(14);
    expect(setRes.body.user.locks).toEqual({ dob: true, gender: true });

    // Can still edit name/email/country/education
    const editRes = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({
        name: "Updated Name",
        email: "updated-profile@example.com",
        countryOfOrigin: "CA",
        yearsOfEducation: 15,
      })
      .expect(200);

    expect(editRes.body.user.name).toBe("Updated Name");
    expect(editRes.body.user.email).toBe("updated-profile@example.com");
    expect(editRes.body.user.countryOfOrigin).toBe("CA");
    expect(editRes.body.user.yearsOfEducation).toBe(15);

    const dbUser = await User.findById(user._id);
    expect(dbUser).toBeTruthy();
    expect(dbUser.dob).toBeTruthy();
    expect(dbUser.gender).toBe("female");
    expect(dbUser.age).toBeUndefined();
  });

  test("cannot change dob or gender once set", async () => {
    const sessionToken = "profile-token-2";

    await User.create({
      name: "New User",
      email: "new-profile@example.com",
      password: "hashed",
      sessionToken,
      tokenExpiresAt: null,
      dob: new Date("1970-03-04T00:00:00.000Z"),
      gender: "male",
      countryOfOrigin: "US",
      yearsOfEducation: 16,
    });

    await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({ dob: "1971-01-01" })
      .expect(403);

    await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({ gender: "female" })
      .expect(403);

    // Still can edit country/education
    const okRes = await request(app)
      .patch("/api/users/me")
      .set("Authorization", `Bearer ${sessionToken}`)
      .send({ countryOfOrigin: "GB", yearsOfEducation: 17 })
      .expect(200);

    expect(okRes.body.user.countryOfOrigin).toBe("GB");
    expect(okRes.body.user.yearsOfEducation).toBe(17);
  });
});

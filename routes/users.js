const express = require("express");
const Joi = require("joi");
const mongoose = require("mongoose");
const User = require("../models/User");
const UserActivity = require("../models/UserActivity");
const USER_CONSTRAINTS = require("../config/userConstraints");

const authMiddleware = require("../middleware/auth");
const { validate } = require("../middleware/validate");

const router = express.Router();

function parseDobInput(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const s = String(value).trim();
  if (!s) return null;

  // Accept date-only (YYYY-MM-DD) to match the mobile app.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeAgeFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
    age -= 1;
  }
  return age;
}

function toIsoDateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function publicUser(user) {
  const dobDateOnly = user.dob ? toIsoDateOnly(user.dob) : null;
  const computedAge = user.dob ? computeAgeFromDob(user.dob) : (user.age ?? null);

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    dob: dobDateOnly,
    age: computedAge,
    gender: user.gender ?? null,
    countryOfOrigin: user.countryOfOrigin ?? null,
    yearsOfEducation: user.yearsOfEducation ?? null,
    locks: {
      dob: Boolean(user.dob),
      gender: Boolean(user.gender),
    },
  };
}

const updateMeSchema = Joi.object({
  name: Joi.string().min(2).max(50).pattern(/^[a-zA-Z\s]+$/).optional(),
  email: Joi.string().email().max(100).optional(),
  dob: Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: Joi.string().valid(...USER_CONSTRAINTS.GENDER_VALUES).optional(),
  countryOfOrigin: Joi.string().max(USER_CONSTRAINTS.COUNTRY_MAX_LEN).optional(),
  yearsOfEducation: Joi.number().integer().min(USER_CONSTRAINTS.EDU_YEARS_MIN).max(USER_CONSTRAINTS.EDU_YEARS_MAX).optional(),
});

// IMPORTANT: define fixed routes like /me BEFORE dynamic routes like /:id.

// GET /api/users - Fetch all users
router.get("/", async (req, res, next) => {
  try {
    const users = await User.find();
    res.json({ users: users });
  } catch (error) {
    console.error("Error fetching users:", error);
    error.statusMessage = "Failed to fetch users.";
    return next(error);
  }
});

// GET /api/users/me - Fetch the current authenticated user
router.get("/me", authMiddleware, async (req, res, next) => {
  try {
    return res.json({ user: publicUser(req.user) });
  } catch (error) {
    console.error("Error fetching current user:", error);
    error.statusMessage = "Failed to fetch user.";
    return next(error);
  }
});

// PATCH /api/users/me - Update profile fields
// Rules:
// - name/email/countryOfOrigin/yearsOfEducation are editable
// - gender and dob can be set once, then become fixed
router.patch("/me", authMiddleware, validate(updateMeSchema), async (req, res, next) => {
  try {
    const user = req.user;
    const { name, email, dob, gender, countryOfOrigin, yearsOfEducation } = req.body || {};

    if (dob != null && !user.dob) {
      const parsed = parseDobInput(dob);
      if (!parsed) {
        return res.status(400).json({ message: "Invalid date of birth. Use YYYY-MM-DD." });
      }
      const todayUtc = new Date(Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate()
      ));
      if (parsed.getTime() > todayUtc.getTime()) {
        return res.status(400).json({ message: "Date of birth cannot be in the future." });
      }
    }

    if (dob != null && user.dob) {
      return res.status(403).json({ message: "Date of birth cannot be changed once set." });
    }

    if (gender != null && user.gender) {
      return res.status(403).json({ message: "Gender cannot be changed once set." });
    }

    if (name != null) user.name = name;

    if (email != null) {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (normalizedEmail !== user.email) {
        const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
        if (existing) {
          return res.status(409).json({ message: "Email already in use" });
        }
        user.email = normalizedEmail;
      }
    }

    if (countryOfOrigin != null) {
      user.countryOfOrigin = String(countryOfOrigin).trim().toUpperCase();
    }

    if (yearsOfEducation != null) {
      user.yearsOfEducation = Number(yearsOfEducation);
    }

    if (gender != null && !user.gender) {
      user.gender = gender;
    }

    if (dob != null && !user.dob) {
      user.dob = parseDobInput(dob);
      // Clear legacy age so DOB becomes the source of truth.
      user.age = undefined;
    }

    await user.save();

    return res.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Error updating current user:", error);
    error.statusMessage = "Failed to update user.";
    return next(error);
  }
});

// GET /api/users/:id - Fetch specific user with activities
router.get("/:id", async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const userActivities = await UserActivity.findOne({ userId: user._id });
    
    // Manually attach "activities" field
    if (userActivities) {
      user._doc.activities = userActivities.categories;
    } else {
      user._doc.activities = []; // empty if no activity found
    }

    res.json({ user: user });
  } catch (error) {
    console.error("Error fetching user:", error);
    error.statusMessage = "Failed to fetch user.";
    return next(error);
  }
});

module.exports = router;

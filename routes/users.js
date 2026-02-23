const express = require("express");
const User = require("../models/User");
const UserActivity = require("../models/UserActivity");

const router = express.Router();

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

// GET /api/users/:id - Fetch specific user with activities
router.get("/:id", async (req, res, next) => {
  try {
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

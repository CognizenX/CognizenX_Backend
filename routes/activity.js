const express = require("express");
const UserActivity = require("../models/UserActivity");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// GET /api/user-preferences - Fetch user preferences
router.get("/user-preferences", authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user._id; // From authMiddleware
    console.log("Fetching preferences for User ID:", userId);

    const activity = await UserActivity.findOne({ userId });
    if (!activity) {
      return res.json({ preferences: [] }); // Return empty preferences if no activity found
    }

    // Prefer explicit selected preferences from Add Categories.
    const selected = Array.isArray(activity.selectedPreferences)
      ? activity.selectedPreferences
      : [];

    const source = selected.length > 0 ? selected : activity.categories;
    if (!source || source.length === 0) {
      return res.json({ preferences: [] });
    }

    const preferences = source.map((category) => ({
      category: category.category,
      subDomain: category.domain,
      count: category.count,
    }));

    // Keep explicit selected order, otherwise sort activity by frequency.
    if (!(selected.length > 0)) {
      preferences.sort((a, b) => b.count - a.count);
    }

    res.json({ preferences });
  } catch (err) {
    console.error("Error fetching preferences:", err);
    err.statusMessage = "Failed to fetch user preferences.";
    return next(err);
  }
});

// PUT /api/user-preferences - Replace explicit selected preferences
router.put("/user-preferences", authMiddleware, async (req, res, next) => {
  const { preferences } = req.body || {};

  if (!Array.isArray(preferences)) {
    return res.status(400).json({
      status: "error",
      message: "preferences must be an array.",
    });
  }

  try {
    const userId = req.user._id;
    let activity = await UserActivity.findOne({ userId });
    if (!activity) {
      activity = new UserActivity({ userId, categories: [], selectedPreferences: [] });
    }

    const seen = new Set();
    const normalized = [];

    preferences.forEach((item) => {
      const category = String(item?.category || "").trim();
      const domain = String(item?.subDomain || item?.domain || "").trim();
      if (!category || !domain) return;

      const key = `${category}::${domain}`;
      if (seen.has(key)) return;
      seen.add(key);

      normalized.push({
        category,
        domain,
        count: 1,
        lastPlayed: new Date(),
      });
    });

    activity.selectedPreferences = normalized;
    await activity.save();

    return res.json({
      status: "success",
      preferences: normalized.map((item) => ({
        category: item.category,
        subDomain: item.domain,
        count: item.count,
      })),
    });
  } catch (error) {
    console.error("Error saving selected preferences:", error);
    error.statusMessage = "Failed to save user preferences.";
    return next(error);
  }
});

// POST /api/log-activity - Log user activity
router.post("/log-activity", authMiddleware, async (req, res, next) => {
  const { category, domain } = req.body;
  console.log("req.body", req.body);
  console.log("category", category);
  console.log("domain", domain);
  
  if (!category || !domain) {
    return res.status(400).json({ 
      status: "error", 
      message: "Both category and domain are required." 
    });
  }

  try {
    const userId = req.user._id; // Get user ID from authMiddleware
    let activity = await UserActivity.findOne({ userId });

    if (!activity) {
      activity = new UserActivity({ userId, categories: [] });
    }

    const categoryIndex = activity.categories.findIndex(
      (c) => c.category === category && c.domain === domain
    );

    if (categoryIndex >= 0) {
      activity.categories[categoryIndex].count += 1;
      activity.categories[categoryIndex].lastPlayed = new Date();
    } else {
      activity.categories.push({ 
        category, 
        domain,
        count: 1, 
        lastPlayed: new Date() 
      });
    }

    await activity.save();

    res.json({ status: "success", message: "Activity logged successfully." });
  } catch (error) {
    console.error("Error logging activity:", error);
    error.statusMessage = "Failed to log activity.";
    return next(error);
  }
});

module.exports = router;

const express = require("express");
const UserActivity = require("../models/UserActivity");
const authMiddleware = require("../middleware/auth");
const { normalizeLegacyCategory } = require("../utils/categoryNormalizer");

const router = express.Router();

// GET /api/user-preferences - Fetch user preferences
router.get("/user-preferences", authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user._id; // From authMiddleware
    console.log("Fetching preferences for User ID:", userId);

    const activity = await UserActivity.findOne({ userId });
    if (!activity || activity.categories.length === 0) {
      return res.json({ preferences: [] }); // Return empty preferences if no activity found
    }

    const preferences = activity.categories.map((category) => {
      // Normalize legacy category/domain values when serializing response
      const rawSubDomain = category.subDomain || category.domain;
      const normalized = normalizeLegacyCategory(category.category, rawSubDomain);
      return {
        category: normalized.category,
        subDomain: normalized.subDomain,
        count: category.count,
      };
    });

    // Sort preferences by count (most frequent first)
    preferences.sort((a, b) => b.count - a.count);

    res.json({ preferences });
  } catch (err) {
    console.error("Error fetching preferences:", err);
    err.statusMessage = "Failed to fetch user preferences.";
    return next(err);
  }
});

// PUT /api/user-preferences - Replace user preferences from Categories screen
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
      activity = new UserActivity({ userId, categories: [] });
    }

    const seen = new Set();
    const normalized = [];

    preferences.forEach((item) => {
      const category = String(item?.category || "").trim();
      const subDomain = String(item?.subDomain || item?.domain || "").trim();

      if (!category || !subDomain) return;

      const legacyNormalized = normalizeLegacyCategory(category, subDomain);
      const nextCategory = String(legacyNormalized.category || "").trim();
      const nextDomain = String(legacyNormalized.subDomain || "").trim();

      if (!nextCategory || !nextDomain) return;

      const key = `${nextCategory}::${nextDomain}`;
      if (seen.has(key)) return;
      seen.add(key);

      normalized.push({
        category: nextCategory,
        subDomain: nextDomain,
        count: 1,
        lastPlayed: new Date(),
      });
    });

    activity.categories = normalized;
    await activity.save();

    return res.json({
      status: "success",
      preferences: normalized.map((item) => ({
        category: item.category,
        subDomain: item.subDomain,
        count: item.count,
      })),
    });
  } catch (error) {
    console.error("Error saving user preferences:", error);
    error.statusMessage = "Failed to save user preferences.";
    return next(error);
  }
});

// POST /api/log-activity - Log user activity
router.post("/log-activity", authMiddleware, async (req, res, next) => {
  let { category } = req.body;
  const resolvedSubDomain = req.body.subDomain || req.body.domain;
  console.log("req.body", req.body);
  console.log("category", category);
  console.log("subDomain", resolvedSubDomain);
  
  if (!category || !resolvedSubDomain) {
    return res.status(400).json({ 
      status: "error", 
      message: "Both category and subDomain are required." 
    });
  }

  // Normalize legacy category/domain values from request
  const normalized = normalizeLegacyCategory(category, resolvedSubDomain);
  category = normalized.category;
  const subDomain = normalized.subDomain;

  try {
    const userId = req.user._id; // Get user ID from authMiddleware
    let activity = await UserActivity.findOne({ userId });

    if (!activity) {
      activity = new UserActivity({ userId, categories: [] });
    }

    const categoryIndex = activity.categories.findIndex(
      (c) => c.category === category && (c.subDomain || c.domain) === subDomain
    );

    if (categoryIndex >= 0) {
      activity.categories[categoryIndex].count += 1;
      activity.categories[categoryIndex].lastPlayed = new Date();

      // Canonicalize legacy records in-place
      activity.categories[categoryIndex].subDomain = subDomain;
      if (activity.categories[categoryIndex].domain != null) {
        activity.categories[categoryIndex].domain = undefined;
      }
    } else {
      activity.categories.push({ 
        category, 
        subDomain,
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

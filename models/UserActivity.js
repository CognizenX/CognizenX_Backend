const mongoose = require("mongoose");

const CategoryActivitySchema = new mongoose.Schema({
  category: { type: String, required: true },
  domain: { type: String, required: true },
  count: { type: Number, default: 0 }, // Frequency of selection
  lastPlayed: { type: Date, default: Date.now },
});

const UserActivitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  categories: [CategoryActivitySchema], // Activity tracking for each category
});

// Index for user activity lookups
UserActivitySchema.index({ userId: 1 });

const UserActivity = mongoose.model("UserActivity", UserActivitySchema);

module.exports = UserActivity;

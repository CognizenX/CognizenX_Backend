const mongoose = require("mongoose");

const CategoryActivitySchema = new mongoose.Schema({
  category: { type: String, required: true },
  // Canonical field name going forward
  subDomain: { type: String, required: true },
  // Legacy field name kept for backward compatibility with existing DB docs.
  // New writes should never set this.
  domain: { type: String, required: false },
  count: { type: Number, default: 0 }, // Frequency of selection
  lastPlayed: { type: Date, default: Date.now },
});

// Backward-compat: older DB docs may only have `domain`.
// Self-heal on save by copying `domain` -> `subDomain` so validation passes.
CategoryActivitySchema.pre("validate", function (next) {
  const hasSubDomain = this.subDomain != null && String(this.subDomain).trim() !== "";
  const hasDomain = this.domain != null && String(this.domain).trim() !== "";

  if (!hasSubDomain && hasDomain) {
    this.subDomain = this.domain;
    this.domain = undefined;
  }

  next();
});

const UserActivitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  categories: [CategoryActivitySchema], // Activity tracking for each category
});

// Index for user activity lookups
UserActivitySchema.index({ userId: 1 });

const UserActivity = mongoose.model("UserActivity", UserActivitySchema);

module.exports = UserActivity;

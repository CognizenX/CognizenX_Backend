const mongoose = require("mongoose");

const AttemptHistorySchema = new mongoose.Schema(
  {
    attemptedAt: { type: Date, required: true },
    isCorrect: { type: Boolean, required: true },
    timeTakenMs: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const UserQuestionStatsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  category: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  subDomain: {
    type: String,
    required: true,
    trim: true,
  },

  // Counters
  attemptCount: { type: Number, default: 0 },
  correctCount: { type: Number, default: 0 },
  incorrectCount: { type: Number, default: 0 },

  // Streaks
  currentWrongStreak: { type: Number, default: 0 },
  maxWrongStreak: { type: Number, default: 0 },
  lastResultCorrect: { type: Boolean, default: null },

  // Timestamps + rolling average
  firstAttemptedAt: { type: Date },
  lastAttemptedAt: { type: Date },
  lastCorrectAt: { type: Date, default: null },
  avgTimeTakenMs: { type: Number, default: 0 },

  attemptHistory: [AttemptHistorySchema],
});

// Compound unique: one stats doc per user per question
UserQuestionStatsSchema.index({ userId: 1, questionId: 1 }, { unique: true });

// For per-user category/subDomain queries
UserQuestionStatsSchema.index({ userId: 1, category: 1, subDomain: 1 });

// Spaced-repetition session selection
UserQuestionStatsSchema.index({ userId: 1, category: 1, subDomain: 1, incorrectCount: 1 });
UserQuestionStatsSchema.index({ userId: 1, category: 1, subDomain: 1, correctCount: 1, lastCorrectAt: 1 });

module.exports = mongoose.model("UserQuestionStats", UserQuestionStatsSchema);

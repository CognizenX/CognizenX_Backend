const mongoose = require("mongoose");

const TriviaAttemptSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
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
      index: true,
    },
    selectedAnswer: {
      type: String,
      required: true,
      trim: true,
    },
    isCorrect: {
      type: Boolean,
      required: true,
      index: true,
    },
    timeTakenMs: {
      type: Number,
      required: true,
      min: 0,
    },
    attemptedAt: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
  },
  { minimize: true }
);

TriviaAttemptSchema.index({ userId: 1, attemptedAt: -1 });

module.exports = mongoose.model("TriviaAttempt", TriviaAttemptSchema);

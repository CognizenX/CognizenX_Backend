const mongoose = require("mongoose");

const GameSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    gameId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    cognitiveDomains: {
      type: [String],
      default: [],
    },
    difficulty: {
      type: String,
      enum: ["easy", "standard"],
      default: "easy",
    },
    startedAt: {
      type: Date,
      required: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    durationMs: {
      type: Number,
      min: 0,
      default: 0,
    },
    score: {
      type: Number,
      min: 0,
      default: 0,
    },
    moves: {
      type: Number,
      min: 0,
      default: 0,
    },
    completed: {
      type: Boolean,
      default: false,
      index: true,
    },
    metrics: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { minimize: true }
);

GameSessionSchema.index({ userId: 1, completedAt: -1 });
GameSessionSchema.index({ userId: 1, gameId: 1 });

module.exports = mongoose.model("GameSession", GameSessionSchema);

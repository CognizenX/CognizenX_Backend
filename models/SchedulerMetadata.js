const mongoose = require('mongoose');

/**
 * SchedulerMetadata Model
 * 
 * PURPOSE:
 * Tracks the scheduler's execution history - how many times it has run, and what the current "week number" is.
 * 
 */
const SchedulerMetadataSchema = new mongoose.Schema({
  // Week counter
  // Week 1-2: bootstrap phase
  // Week 3+: dynamic/tier-based phase
  weekNumber: {
    type: Number,
    default: 0,
  },

  lastRunAt: {
    type: Date,
    default: null,
  },

  // Total questions generated across all runs 
  totalQuestionsGenerated: {
    type: Number,
    default: 0,
  },

  // Created timestamp
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Ensure only ONE metadata document exists
SchedulerMetadataSchema.index({ _id: 1 }, { unique: true });

const SchedulerMetadata = mongoose.model("SchedulerMetadata", SchedulerMetadataSchema);

module.exports = SchedulerMetadata;

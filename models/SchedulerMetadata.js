const mongoose = require("mongoose");

const SchedulerMetadataSchema = new mongoose.Schema({
  // ISO week number (1–53) of the year the scheduler ran
  weekNumber: {
    type: Number,
    default: 0,
    index: true,
  },

  category: {
    type: String,
    required: true,
    trim: true,
  },

  subDomain: {
    type: String,
    required: true,
    trim: true,
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

// One scheduler record per category+subDomain per week
SchedulerMetadataSchema.index({ category: 1, subDomain: 1, weekNumber: 1 }, { unique: true });

module.exports = mongoose.model("SchedulerMetadata", SchedulerMetadataSchema);

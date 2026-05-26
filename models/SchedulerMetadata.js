const mongoose = require("mongoose");

const SchedulerMetadataSchema = new mongoose.Schema({
  metadataType: {
    type: String,
    enum: ["global", "categorySignal"],
    default: "global",
  },

  category: {
    type: String,
    default: null,
  },

  subDomain: {
    type: String,
    default: null,
  },

  // ISO week number (1–53) of the year the scheduler ran
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

// Keep one global scheduler-state document, plus one category signal per week.
SchedulerMetadataSchema.index(
  { metadataType: 1 },
  { unique: true, partialFilterExpression: { metadataType: "global" } }
);

SchedulerMetadataSchema.index(
  { metadataType: 1, category: 1, subDomain: 1, weekNumber: 1 },
  { unique: true, partialFilterExpression: { metadataType: "categorySignal" } }
);

module.exports = mongoose.model("SchedulerMetadata", SchedulerMetadataSchema);

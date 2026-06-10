const mongoose = require('mongoose');

const SubDomainDemandSnapshotSchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true },
  subDomain: { type: String, required: true, trim: true },
  weekNumber: { type: Number, required: true },
  cronRunId: { type: String, required: true },

  bankSize: { type: Number, default: 0 },
  maxUserCoverage: { type: Number, default: 0 },
  exhaustedUserCount: { type: Number, default: 0 },
  weeklyAttempts: { type: Number, default: 0 },
  activeUsers7d: { type: Number, default: 0 },
  preferenceWeight: { type: Number, default: 0 },
  avgSessionsPerUser: { type: Number, default: 0 },
  hotScore: { type: Number, default: 0 },
  generationTarget: { type: Number, default: 0 },
  tier: {
    type: String,
    enum: ['empty', 'critical', 'hot', 'warm', 'cold'],
    default: 'cold',
  },

  questionsGenerated: { type: Number, default: 0 },
  fulfilledAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

SubDomainDemandSnapshotSchema.index(
  { category: 1, subDomain: 1, weekNumber: 1, cronRunId: 1 },
  { unique: true }
);
SubDomainDemandSnapshotSchema.index({ weekNumber: 1, hotScore: -1 });

module.exports = mongoose.model('SubDomainDemandSnapshot', SubDomainDemandSnapshotSchema);

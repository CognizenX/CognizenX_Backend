/**
 * P0.9 — hard-delete every user-linked behavioural collection, then the User row.
 * Order: child collections first, User last.
 */
const mongoose = require("mongoose");
const User = require("../models/User");
const UserActivity = require("../models/UserActivity");
const TriviaAttempt = require("../models/TriviaAttempt");
const UserQuestionStats = require("../models/UserQuestionStats");
const GameSession = require("../models/GameSession");
const Report = require("../models/Report");

const USER_LINKED_MODELS = [
  { name: "triviaattempts", model: TriviaAttempt },
  { name: "userquestionstats", model: UserQuestionStats },
  { name: "gamesessions", model: GameSession },
  { name: "reports", model: Report },
  { name: "useractivities", model: UserActivity },
];

function toObjectId(userId) {
  if (userId instanceof mongoose.Types.ObjectId) return userId;
  return new mongoose.Types.ObjectId(String(userId));
}

async function countUserLinkedData(userId) {
  const id = toObjectId(userId);
  const counts = {};
  for (const { name, model } of USER_LINKED_MODELS) {
    counts[name] = await model.countDocuments({ userId: id });
  }
  counts.users = await User.countDocuments({ _id: id });
  return counts;
}

/**
 * @returns {{ deleted: Record<string, number>, userId: string }}
 */
async function deleteUserCascade(userId) {
  const id = toObjectId(userId);
  const deleted = {};

  for (const { name, model } of USER_LINKED_MODELS) {
    const result = await model.deleteMany({ userId: id });
    deleted[name] = result.deletedCount || 0;
  }

  const userResult = await User.deleteOne({ _id: id });
  deleted.users = userResult.deletedCount || 0;

  return { userId: String(id), deleted };
}

/**
 * Delete behavioural rows whose userId no longer exists in users.
 * @returns {{ scanned: Record<string, number>, deleted: Record<string, number>, orphanUserIds: string[] }}
 */
async function sweepOrphanUserData({ dryRun = true } = {}) {
  const userIds = await User.find({}, { _id: 1 }).lean();
  const living = new Set(userIds.map((row) => String(row._id)));

  const scanned = {};
  const deleted = {};
  const orphanUserIds = new Set();

  for (const { name, model } of USER_LINKED_MODELS) {
    const distinct = await model.distinct("userId");
    const orphanIds = distinct.filter((id) => id && !living.has(String(id)));
    orphanIds.forEach((id) => orphanUserIds.add(String(id)));

    const filter = orphanIds.length ? { userId: { $in: orphanIds } } : { userId: { $in: [] } };
    scanned[name] = orphanIds.length
      ? await model.countDocuments(filter)
      : 0;

    if (dryRun || !orphanIds.length) {
      deleted[name] = 0;
      continue;
    }

    const result = await model.deleteMany(filter);
    deleted[name] = result.deletedCount || 0;
  }

  return {
    dryRun,
    scanned,
    deleted,
    orphanUserIds: Array.from(orphanUserIds),
  };
}

module.exports = {
  USER_LINKED_MODELS,
  countUserLinkedData,
  deleteUserCascade,
  sweepOrphanUserData,
};

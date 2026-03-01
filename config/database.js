const mongoose = require("mongoose");

// Database connection string: use environment variables only (no hardcoded fallback)
const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL;

let connectPromise = null;

/**
 * Connect to MongoDB unless running in test mode.
 * Returns a Promise that resolves when connected (or rejects on error).
 * Safe to call multiple times: reuses the same connection promise.
 */
function connectDatabase() {
  if (process.env.NODE_ENV === "test") {
    return Promise.resolve();
  }
  if (!MONGO_URI) {
    console.error("MongoDB connection string missing: set MONGO_URI (or MONGO_URL)");
    return Promise.reject(new Error("MONGO_URI not set"));
  }
  if (connectPromise) {
    return connectPromise;
  }
  connectPromise = mongoose
    .connect(MONGO_URI)
    .then(() => {
      console.log("MongoDB Connected");
      return mongoose.connection;
    })
    .catch((err) => {
      console.error("MongoDB connection error:", err);
      connectPromise = null;
      throw err;
    });
  return connectPromise;
}

/**
 * Returns a Promise that resolves when MongoDB is ready (connected or already connected).
 * Use in middleware so serverless requests wait for DB before handling.
 */
function ensureDatabase() {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve();
  }
  return connectDatabase();
}

module.exports = { connectDatabase, ensureDatabase, MONGO_URI };

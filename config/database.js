const mongoose = require("mongoose");

// Database connection string: use environment variables only (no hardcoded fallback)
const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL;

/**
 * Connect to MongoDB unless running in test mode.
 * Exported so app.js can call it at startup without
 * owning the connection logic itself.
 */
function connectDatabase() {
  if (process.env.NODE_ENV !== "test") {
    if (!MONGO_URI) {
        console.error("MongoDB connection string missing: set MONGO_URI (or MONGO_URL)");
    } else {
        mongoose
        .connect(MONGO_URI)
        .then(() => console.log("MongoDB Connected"))
        .catch((err) => console.log(err));
    }
  }
}

module.exports = { connectDatabase, MONGO_URI };

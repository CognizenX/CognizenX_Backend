const expressRateLimit = require("express-rate-limit");

// v8 exports { rateLimit, ipKeyGenerator }. Keep compatibility with default export.
const rateLimit = expressRateLimit.rateLimit || expressRateLimit;
const { ipKeyGenerator } = expressRateLimit;

// More lenient in development, reasonable in production
const isDevelopment =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV !== "production";

// Use express-rate-limit's helper so IPv6 addresses are normalized safely.
const keyGenerator = (req, res) => {
  if (typeof ipKeyGenerator === "function") {
    return ipKeyGenerator(req, res);
  }
  // Fallback: shouldn't happen on v8, but keep safe behavior.
  return req.ip || req.socket?.remoteAddress || "unknown";
};

/**
 * Rate limiter scoped to authentication endpoints.
 * Tighter limits to prevent brute-force attacks.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 50 : 15,
  keyGenerator,
  message: {
    message:
      "Too many authentication attempts from this IP, please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (
      isDevelopment &&
      (req.ip === "127.0.0.1" || req.ip === "::1" || req.ip === "::ffff:127.0.0.1")
    ) {
      return true;
    }
    return false;
  },
});

/**
 * Global rate limiter applied to every request.
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 1000 : 100,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (
      isDevelopment &&
      (req.ip === "127.0.0.1" || req.ip === "::1" || req.ip === "::ffff:127.0.0.1")
    ) {
      return true;
    }
    return false;
  },
});

module.exports = { authLimiter, globalLimiter };

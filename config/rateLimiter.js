const rateLimit = require("express-rate-limit");

// More lenient in development, reasonable in production
const isDevelopment =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV !== "production";

// Behind Vercel (or any proxy), use X-Forwarded-For so rate limit is per client IP
const keyGenerator = (req) => {
  const forwarded = req.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
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

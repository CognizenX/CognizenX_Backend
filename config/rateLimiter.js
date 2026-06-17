const crypto = require("crypto");
const expressRateLimit = require("express-rate-limit");

// v8 exports { rateLimit, ipKeyGenerator }. Keep compatibility with default export.
const rateLimit = expressRateLimit.rateLimit || expressRateLimit;
const { ipKeyGenerator } = expressRateLimit;

const WINDOW_MS = 15 * 60 * 1000;
const isProduction = process.env.NODE_ENV === "production";

function parseLimit(name, productionDefault, developmentDefault) {
  const raw = process.env[name];
  if (raw != null && raw !== "") {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return isProduction ? productionDefault : developmentDefault;
}

const AUTH_LIMIT_MAX = parseLimit("AUTH_RATE_LIMIT_MAX", 15, 50);
const ANON_LIMIT_MAX = parseLimit("GLOBAL_RATE_LIMIT_MAX_ANON", 80, 1000);
const USER_LIMIT_MAX = parseLimit("GLOBAL_RATE_LIMIT_MAX_USER", 400, 2000);

function getClientIp(req, res) {
  const forwarded = req.get("x-forwarded-for");
  const clientIp = forwarded
    ? forwarded.split(",")[0].trim()
    : req.ip || req.socket?.remoteAddress || "unknown";

  if (typeof ipKeyGenerator === "function") {
    return ipKeyGenerator(req, res);
  }

  return clientIp;
}

function extractBearerToken(req) {
  const authHeader = req.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function hasBearerToken(req) {
  return Boolean(extractBearerToken(req));
}

/**
 * Authenticated requests: per session token (fair on shared Wi-Fi).
 * Anonymous requests: per client IP.
 */
function globalKeyGenerator(req, res) {
  const token = extractBearerToken(req);
  if (token) {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex").slice(0, 24);
    return `user:${tokenHash}`;
  }
  return `ip:${getClientIp(req, res)}`;
}

function shouldSkipLocalhost(req) {
  return (
    !isProduction &&
    (req.ip === "127.0.0.1" || req.ip === "::1" || req.ip === "::ffff:127.0.0.1")
  );
}

/**
 * Auth routes only — always per IP to slow brute-force login/signup attempts.
 */
const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: AUTH_LIMIT_MAX,
  keyGenerator: (req, res) => `auth-ip:${getClientIp(req, res)}`,
  message: {
    message:
      "Too many authentication attempts from this IP, please try again after 15 minutes.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipLocalhost,
});

/**
 * All API traffic — higher per-user cap after login; tighter per-IP when anonymous.
 */
const globalLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: (req) => (hasBearerToken(req) ? USER_LIMIT_MAX : ANON_LIMIT_MAX),
  keyGenerator: globalKeyGenerator,
  message: (req) => ({
    message: hasBearerToken(req)
      ? "Too many requests for this account. Please wait a few minutes and try again."
      : "Too many requests from this network. Please wait a few minutes and try again.",
  }),
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipLocalhost,
});

module.exports = {
  authLimiter,
  globalLimiter,
  AUTH_LIMIT_MAX,
  ANON_LIMIT_MAX,
  USER_LIMIT_MAX,
};

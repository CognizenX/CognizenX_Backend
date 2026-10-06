/**
 * P0.6A — optional minimum client version gate.
 *
 * When MIN_SUPPORTED_APP_VERSION is unset/empty, every client is allowed
 * (including the current store app on unversioned /api).
 *
 * When set, requests under /api must send X-App-Version >= that value or
 * receive 426 FORCE_UPDATE. Internal cron routes and the /api health
 * probes are exempt so Vercel cron and probes keep working.
 */

function parseVersionParts(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/^v/i, "")
    .split(/[^0-9]+/)
    .filter(Boolean);
  return cleaned.map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

function compareVersions(a, b) {
  const left = parseVersionParts(a);
  const right = parseVersionParts(b);
  const length = Math.max(left.length, right.length, 1);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function isExemptPath(pathname) {
  const path = String(pathname || "").split("?")[0].replace(/\/+$/, "") || "/";
  if (path === "/api" || path === "/api/v1") return true;
  if (/^\/api(\/v1)?\/internal(\/|$)/.test(path)) return true;
  return false;
}

function requireMinAppVersion(req, res, next) {
  const min = String(process.env.MIN_SUPPORTED_APP_VERSION || "").trim();
  if (!min) return next();

  const path = req.path || req.originalUrl || "";
  if (!path.startsWith("/api")) return next();
  if (isExemptPath(path)) return next();

  const clientVersion = String(req.get("x-app-version") || "").trim();
  if (clientVersion && compareVersions(clientVersion, min) >= 0) {
    return next();
  }

  return res.status(426).json({
    status: "error",
    code: "FORCE_UPDATE",
    message: "Please update the app to continue.",
    minSupportedAppVersion: min,
  });
}

module.exports = {
  requireMinAppVersion,
  compareVersions,
  isExemptPath,
};

/**
 * Sentry must load before the rest of the app (Express / OpenAI / Mongoose).
 * Callers must load dotenv before requiring this file.
 * No-ops when SENTRY_DSN is unset (local tests, CI without secrets).
 */
const Sentry = require("@sentry/node");

if (!global.__mindmitraSentryInitialized) {
  const dsn = process.env.SENTRY_DSN;
  if (dsn) {
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
      release: process.env.SENTRY_RELEASE || undefined,
      // Align with PostHog: no email/name/IP as default PII.
      sendDefaultPii: false,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    });
  }
  global.__mindmitraSentryInitialized = true;
}

module.exports = Sentry;

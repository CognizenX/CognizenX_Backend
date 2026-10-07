# Sentry (P0.7)

Org: [mindmitra.sentry.io](https://mindmitra.sentry.io)

| App | Project slug | SDK |
|---|---|---|
| Mobile (`frontend/`) | `mindmitra-mobile` | `@sentry/react-native` |
| API (`backend/`) | `mindmitra-api` | `@sentry/node` |

## Local env

- Backend: `SENTRY_DSN`, optional `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`
- Frontend: `SENTRY_DSN`, optional `SENTRY_ENVIRONMENT`, `SENTRY_SEND_TEST_ERROR=1` (dev boot test only)

Never commit real DSNs. Placeholders live in `.env.example`.

## Verify

API (non-production):

```bash
curl -i http://127.0.0.1:6000/api/v1/debug-sentry
```

Mobile: set `SENTRY_SEND_TEST_ERROR=1` in `frontend/.env`, rebuild/run once, then set it back to `0`.

## Production

1. Vercel backend env: `SENTRY_DSN` (API project), `SENTRY_ENVIRONMENT=production`, optional `SENTRY_RELEASE`.
2. Mobile release builds: keep `SENTRY_DSN` in the release env / secrets used by CI; set `SENTRY_ENVIRONMENT=production`.
3. Source maps / native symbols: run the Sentry React Native wizard (or upload debug files) before relying on production stack traces. Node source maps are optional until the API is bundled.

## Privacy

`sendDefaultPii` is off on both SDKs (aligned with PostHog: no email/name by default).

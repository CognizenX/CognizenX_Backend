# API versioning (P0.6A)

## What shipped

- Same route handlers are mounted on `/api/*` and `/api/v1/*`.
- The P0 mobile app calls `/api/v1` only and sends `X-App-Version` (currently `3.0.0` in `frontend/config/backend.js`).
- The existing store build keeps calling unversioned `/api` and is unchanged.
- `MIN_SUPPORTED_APP_VERSION` is optional. Leave it empty so every client is allowed.

## Force update

When `MIN_SUPPORTED_APP_VERSION` is set (example `3.0.0`):

- Clients below that version, or missing `X-App-Version`, get `426` with `{ code: "FORCE_UPDATE", ... }`.
- The P0 app shows `ForceUpdateScreen` instead of crashing or showing an empty state.
- Exempt paths: `/api`, `/api/v1`, and `/api/internal/*` (cron).

Do **not** set the env var until the P0 store build is the minimum you want to support. Setting it earlier would force the current store app to update before that build exists.

## Cutover later

1. Ship the P0 store build that talks to `/api/v1`.
2. Set `MIN_SUPPORTED_APP_VERSION` on Vercel to that release’s version.
3. After adoption is high enough, remove the unversioned `/api` mounts.

P0.6B (OTA) and P0.6C (DB rename) are out of scope for this pass.

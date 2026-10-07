# Data residency and retention (P0.9)

## Residency

Live Atlas cluster region: **AWS / N. Virginia (`us-east-1`)**.

Recorded for GDPR/DPDP disclosure. Revisit if the cohort expands into regions that require a different residency choice.

## Account deletion (hard delete)

`DELETE /api/auth/delete-account` hard-deletes the account and all user-linked product data:

- `triviaattempts`
- `userquestionstats`
- `gamesessions`
- `reports`
- `useractivities` (preferences / activity)
- `users`

Implementation: `services/deleteUserCascade.js`.

PostHog: best-effort person delete via `POST /api/projects/:id/persons/bulk_delete/` (distinct id = Mongo `userId`) when `POSTHOG_PERSONAL_API_KEY` (`person:write`) and `POSTHOG_PROJECT_ID` are set (`delete_events=true`).

## Retention while the account exists

- Quiz attempts, game sessions, and question stats are kept for product use (history / future spaced-repetition work). No TTL for the first cohort.
- Revisit a rolling window (e.g. 24 months) only if legal asks for one.

## Orphan sweep

Historical deletes left behavioural rows behind. One-time / periodic cleanup:

```bash
node scripts/script_P0/sweep-orphan-user-data.js
node scripts/script_P0/sweep-orphan-user-data.js --confirm --confirm-production
```

Dry-run by default. Non-localhost requires `--confirm-production`.

## Application logs

Server / platform logs: target **30–90 days** (hosting provider defaults apply until tightened).

## Privacy policy

Public privacy policy URL is still required before first external users (analytics, AI processing of quiz content, future family/caregiver visibility). Tracked as an open item for the P0 summary; eng draft deferred.

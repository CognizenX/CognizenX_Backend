# MindMitra event taxonomy (P0.3)

Lock this list before adding instrumentation. **New events ship in the same PR as the tracking code.**

## Rules

- Names: `object_verb`, snake_case, past tense (`quiz_started`, not `startQuiz`).
- **No PII** in event properties or person properties (no email, name, raw DOB, question text, answer text).
- Prefer coarse ids: Mongo `userId` as `distinct_id`, category / subDomain / gameId / difficulty.
- Client events fire only when the user has **analytics consent** (`optIn`). Server cron events use a fixed system distinct id.
- Internal eng/test accounts set person property `isInternal: true` (excluded from product dashboards by filter).

## Identity

| Step | Behaviour |
|------|-----------|
| First launch | Anonymous `distinct_id` |
| Signup / login / session restore | `identify(userId)` with non-PII `$set` / `$set_once` person props |
| Logout / account delete | `reset()` (and server-side person deletion later in P0.9) |

Person properties: `platform`, `isInternal`, `analyticsConsent`, `highestEducationLevel`, `countryOfOrigin`, `selected_categories`, `$set_once.signup_date`.

## Client events

| Event | When | Key properties |
|-------|------|----------------|
| `app_opened` | Cold/warm launch after consent applied | `launch_type` (`cold`/`warm`), `days_since_last_open` |
| `signup_started` | Signup screen focused | — |
| `signup_completed` | Account created + identified | — |
| `login_completed` | Login success + identified | — |
| `categories_selected` | Preferences saved | `categories`, `count`, `is_first_time` |
| `quiz_started` | Quiz questions loaded | `source`, `question_count`, `is_personalised`, `category_count` |
| `question_answered` | Each answer selected | `position`, `correct`, `latency_ms`, `category`, `subDomain`, `difficulty` |
| `quiz_abandoned` | User exits mid-quiz | `position_reached`, `question_count` |
| `quiz_completed` | Last question answered | `score`, `correct_count`, `question_count`, `duration_ms`, `last_answer_position` |
| `explanation_viewed` | Explanation body shown | `question_position`, `dwell_ms` (on leave / unmount) |
| `game_started` | Game session starts | `gameId`, `cognitiveDomains`, `difficulty` |
| `game_completed` | Session finishes successfully | `gameId`, `cognitiveDomains`, `difficulty`, `score`, `duration_ms` |
| `game_abandoned` | Session ends incomplete | `gameId`, `cognitiveDomains`, `difficulty`, `score`, `duration_ms` |
| `question_reported` | Report submitted | `reason_length` (not free text) |
| `profile_updated` | Profile PATCH success | `updated_field_count` |
| `account_deleted` | Before local reset | — |
| `analytics_consent_updated` | Consent toggle | `analytics_consent` |

## Server events

| Event | When | Key properties |
|-------|------|----------------|
| `weekly_generation_run` | Cron weekly generation finishes | `week_number`, `generated`, `explained`, `deduped`, `categories_processed`, `categories_with_questions`, `duration_s`, `success` |

System distinct id: `mindmitra_cron`.

## Consent

- Default: **opted out** until explicit opt-in (signup checkbox or Account → Settings toggle).
- Opt-out: `posthog.optOut()` — no client events.
- Stored on `User.analyticsConsent` and mirrored as a person property.

## Feature flags (stub keys, unused OK)

- `p1_cohort_staging`
- `p2_experiments_enabled`

## Dashboards

- **Activation** — open → signup → categories → quiz start → complete
- **Weekly Retention** — return opens / completions by week

## PR checklist

- [ ] Event name exists in this doc (or doc updated in same PR)
- [ ] No PII / question text in props
- [ ] Consent respected on client
- [ ] Internal users filterable via `isInternal`

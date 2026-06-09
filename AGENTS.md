# CognizenX Backend — Agent Guide

## Purpose

Express API for CognizenX trivia: question bank (MongoDB), user activity, trivia attempts, and optional OpenAI question generation via a weekly scheduler.

**GitHub repo:** `CognizenX/CognizenX_Backend`  
**Default push branch:** `V3.1` (unless the user specifies otherwise)

## Workspace layout

This folder (`backend/`) is the API codebase. The mobile app lives in `frontend/` (repo `shulabhb/CognizenX`). Treat them as independent repos.

## MongoDB schema

Database: typically `dementia_database` on Atlas (`triviacategories` collection).

### `triviacategories` (primary question store)

One document per `{ category, subDomain }` pair. Questions are **embedded arrays**, not a separate collection.

| Field | Type | Notes |
|-------|------|-------|
| `category` | String | e.g. `religion`, `politics` |
| `subDomain` | String | e.g. `Hindu`, `National` |
| `questions` | Array | Embedded question subdocs with `_id`, `question`, `options`, `correct_answer`, etc. |
| `seen` | Number | Global seen count (scheduler trigger) |
| `createdAt` | Date | |

**Unique index:** `{ category: 1, subDomain: 1 }`

### Other collections

- `users`, `useractivities` (saved category preferences)
- `triviaattempts`, `userquestionstats` (per-user attempt tracking)
- `schedulermetadatas` (weekly generation metadata)

## Religion / mythology taxonomy

**Canonical category:** `religion`  
**Legacy alias:** `mythology` (still matched at read time during migration window)

**Canonical subdomains** (must match frontend `CategoriesScreen.js` and `config/categories.js`):

`Hindu`, `Islam`, `Christianity`, `Sikhism`, `Buddhism`, `Jainism`

**Legacy subdomain mappings** (runtime, via `utils/taxonomy.js`):

- `Other Mythologies` → `Sikhism`
- Case-insensitive matching for all religion subdomains

Frontend sends: `GET /api/random-questions?categories=religion&subDomain=Hindu` — no frontend normalization.

## Key files

| Path | Role |
|------|------|
| `utils/taxonomy.js` | Canonical category/subdomain normalization + MongoDB alias queries |
| `config/categories.js` | Category/subdomain definitions + article keyword lists |
| `routes/questions.js` | `/api/questions`, `/api/random-questions`, weekly cron |
| `routes/ai.js` | OpenAI generate-questions / generate-explanation |
| `routes/trivia.js` | Attempt recording + daily metrics |
| `routes/activity.js` | User preferences + log-activity |
| `services/questionScheduler.js` | Bulk OpenAI generation for cron |
| `scripts/migrate-mythology-to-religion.js` | One-time DB migration: redistribute legacy mythology docs |
| `scripts/category-question-report.js` | Live per-category question counts vs config |

## Question fetch flow

```
Frontend → GET /api/random-questions?categories=religion&subDomain=Hindu
         → normaliseTaxonomyInput()
         → buildCategorySubDomainQuery()  // matches religion OR mythology, Hindu aliases
         → TriviaCategory.findOne()
         → return up to 10 random embedded questions
```

**Important:** After religion migration, `/api/random-questions` must **not** fall back to another subdomain when the requested one is empty (prevents cross-faith leakage).

## Semantic dedup layer

All question ingestion paths use `services/questionIngestion.js`:
1. Exact text dedup
2. OpenAI embedding cosine similarity within the same `category + subDomain`
3. Rejected near-duplicates can be regenerated in bulk scripts

Env vars:
- `SEMANTIC_SIMILARITY_THRESHOLD` (default `0.85`)
- `EMBEDDING_MODEL` (default `text-embedding-3-small`)

```bash
node scripts/bulk-fill-religion-subdomains.js --dry-run
node scripts/bulk-fill-religion-subdomains.js --confirm
node scripts/audit-semantic-duplicates.js --category=religion
```

## Migration commands

Requires working `MONGO_URI` in `.env`.

```bash
# Preview redistribution (keyword only, no AI, no writes)
node scripts/migrate-mythology-to-religion.js --dry-run --no-ai

# Run live migration (after reviewing dry-run report)
node scripts/migrate-mythology-to-religion.js --no-ai

# Post-migration counts
node scripts/category-question-report.js
```

Migration writes:

- `reports/religion-migration-backup-{timestamp}.json` — backup of source docs
- `reports/religion-redistribution-{timestamp}.json` — unclassified questions for manual review

## Agent constraints

- Do **not** AI-seed religion questions unless the user explicitly asks.
- Do **not** change frontend category/subdomain strings without coordinating both repos.
- Do **not** auto-assign unclassified religion questions to a fallback faith; export for manual review.
- Only commit when the user asks. Push backend work to `V3.1` by default.

## Tests

```bash
npm test -- tests/taxonomy.test.js
npm test -- tests/questions.test.js
```

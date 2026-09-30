# Explanation coverage (P0.4)

Measured on 29 Sep 2026 against the live trivia bank. Backfill is complete. Coverage is 100%.

## Coverage

| | Before | After |
|---|---:|---:|
| Questions | 6,345 | 6,345 |
| With an explanation | 4,449 | 6,345 |
| Missing | 1,896 | 0 |
| Coverage | 70.1% | 100% |

The 95% target is met. AI-generated questions accounted for 1,184 of the gaps. The other 712 were not marked AI-generated.

Largest gaps before the backfill: politics 400, geography 359, history 358, general knowledge 243, current affairs 185, sports 126 (57% of that category), entertainment 126, religion 96.

## Backfill

Script: `backend/scripts/script_P0/backfill-explanations.js`

It selects questions whose `explanation` is missing or blank, calls the same `gpt-4` prompt the quiz generator uses (`max_tokens` 60, correct answer passed as both the user answer and the correct answer), retries on failure, and writes `explanation` plus `explanationGeneratedAt`. A rerun only picks rows that are still empty.

| Run | Written | Failed | Input tokens | Output tokens | List-price cost |
|---|---:|---:|---:|---:|---:|
| Smoke (2) | 2 | 0 | 243 | 77 | $0.01 |
| Remainder | 1,894 | 0 | 226,728 | 76,217 | $11.37 |
| **Total** | **1,896** | **0** | **226,971** | **76,294** | **$11.39** |

Cost uses GPT-4 list prices ($30 / 1M input, $60 / 1M output) against usage reported by the API. The earlier character estimate was 241k input and 95k output (~$13). Actual output was lower because completions averaged about 40 tokens, under the 60-token cap.

Logs:

- `backend/reports/Reports_p0/explanation-backfill-2026-09-29T22-54-33-501Z.summary.json` (smoke)
- `backend/reports/Reports_p0/explanation-backfill-2026-09-29T22-55-02-435Z.summary.json` (remainder)

The main run finished in about 21 minutes at concurrency 3, with no rate-limit failures.

## Root cause

Two separate facts.

**The empty explanations were already in the bank.** Every question created since the 27 Sep 2026 Sunday cron has an explanation (81 questions, 0 missing). Current `questionScheduler` drops a generated question when the explanation call fails after three tries, so that path does not persist a bare answer.

**The latest weekly cron still stopped early.** Run `cron-1-1790474499020` at 27 Sep 2026 02:01 UTC wrote 43 demand snapshots. `generationTarget` totaled 300 (hot 150 across 3 subdomains, warm 150 across 7, cold 0). `questionsGenerated` was 49, all in current affairs / Health and Environment. Warm generated nothing. That shortfall matches an incomplete serverless run, but this pass did not pull Vercel function logs, so a timeout is not confirmed from logs. It did not add to the empty-explanation pile.

Backfill repairs the historical gap. It does not make the Sunday job finish its plan. Splitting that job (P1.3) is still the follow-up if later snapshots keep showing `questionsGenerated` well below `generationTarget`.

## Alert

```bash
node scripts/script_P0/explanation-coverage.js --threshold 0.9
```

Prints coverage and exits 1 when it is under 90%. Exit 0 is the healthy case. Sentry wiring for this check is still part of P0.7.

## Still open

- Weekly cron in `backend/vercel.json` is still `0 2 * * 0`. Leave it paused until the P0.5 audit and a review step exist, so new unaudited questions do not keep landing.
- These explanations were not fact-checked. P0.5 is the audit, and it should run against this filled bank.
- Explanations are short by prompt (1–2 sentences, under 50 words). They are not a substitute for a human review of the answer key.

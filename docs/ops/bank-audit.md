# Bank audit (P0.5 progress)

Report-only passes on 29 Sep 2026. Ten sample concerns are flagged on the live questions. Five of those are marked so quizzes can skip them once this backend is deployed. Nothing was deleted and no answer key was rewritten.

## Pass 1 — structure

`backend/scripts/script_P0/audit-bank.js` over 6,345 questions.

| Check | Count |
|---|---:|
| Answer missing from options, disagreeing answer fields, empty explanation, missing embedding | 0 |
| Duplicate options | 1 |
| Markdown leftovers | 2 |
| Question subdomain label differs from parent document | 502 |
| Correct answer is the first option | 4,515 (71%) |

The subdomain mismatches are mostly camelCase versus the parent label (`ancientIndia` vs `Ancient India`). A few look like a real topic slip, such as Bollywood Movies stored as `tollywood`. Those were not auto-edited.

The first-option skew is the structural defect. A fair four-option bank would land near 25%.

## Pass 2 — duplicates

Embeddings were present on every question. Pairs at or above the 0.85 ingest threshold: **0**. Review clustering at 0.75 grouped 2,184 questions into 743 clusters. The largest is geography / States and Capitals (55). Those clusters chain same-shape questions together, so cluster size is not a duplicate count and nothing was purged.

Detail: `backend/reports/Reports_p0/bank-audit-2026-09-29T23-26-53-177Z.summary.json`.

## Pass 3 — gpt-4o sample

Random 100, seed `504`, model `gpt-4o`. No bank edits in the judging run itself.

| | Result |
|---|---|
| Judged | 100 / 100 calls succeeded |
| Marked answer judged correct | 92% |
| Exactly one defensible option | 90% |
| Explanation supports the answer | 94% |
| No concern | 90% |
| Tokens | 27,452 input, 7,341 output |
| Sample cost | $0.14 at gpt-4o list prices ($2.50 / 1M input, $10 / 1M output) |
| Full-bank estimate from this rate | about $9 |

Verdicts: `backend/reports/Reports_p0/bank-verify-sample-2026-09-29T23-32-50-904Z.json`.

This is the model disagreeing with the key, not a human score. An 8% wrong-key rate on 100 questions is a wide band for the rest of the bank.

## What was saved on the questions

`node scripts/script_P0/apply-review-flags.js` wrote these fields onto the 10 concerns:

- `reviewStatus: "flagged"`
- `reviewFlags`, `reviewConfidence`, `reviewReason`, `reviewModel`, `reviewedAt`
- `reviewExcludeFromQuiz`

A question is withheld from quizzes only when the marked answer was judged wrong **and** confidence is at least 0.7. Other concerns stay in the bank and stay servable until a person clears or removes them.

Withheld (5):

| Question | Why |
|---|---|
| `69a762fa7d4f0d0570f6ef9f` | Bahadur Shah name in the key does not match the explanation (confidence 1) |
| `69af5dcac135bf1dd1f83c55` | “Vande Mataram” attributed to Tagore instead of Bankim Chandra Chatterjee (confidence 1) |
| `69a754e1afa099a6a538cfe0` | Bangladesh treated as an African country (confidence 1) |
| `6a52f662517fd32df0244ecd` | Tripura / Mizoram geography explanation judged wrong (confidence 0.8) |
| `6984047cf9cf61c8d5895078` | BCCI president called Sourav Ganguly; model says Roger Binny succeeded him (confidence 0.7, dated) |

Flagged but still servable (5): Tata Steel “first listed company” (confidence 0.2), a US National Monument item (0.3), Pichwai vs Phad (0.6), Krishna’s flute names Murali/Venu (0.7, answer accepted, options ambiguous), and rivers of Mansarovar (0.9, answer accepted, more than one option defensible).

`/api/user-quiz` and `/api/random-questions` skip `reviewExcludeFromQuiz`. That filter is in this backend only. The deployed Vercel app will keep serving those five until this code is deployed. Review fields are not returned to the app.

## Pass 3 — full bank, gpt-4o

Ran after the sample, over all 6,345 questions, seed `504`. Every call succeeded. Same withhold rule: wrong marked answer and confidence at least 0.7. Other concerns are flagged and stay servable. Nothing was deleted.

| | Result |
|---|---:|
| Marked answer judged correct | 5,847 (92.2%) |
| Exactly one defensible option | 5,952 (93.8%) |
| Explanation supports the answer | 5,881 (92.7%) |
| No concern | 5,775 (91.0%) |
| Concerns | 570 |
| Withheld from quizzes | 332 |
| Flagged, still servable | 238 |
| Input / output tokens | 1,734,233 / 465,990 |
| List-price cost | $9.00 |

Flag counts: wrong key 301, bad explanation 321, ambiguous 189, dated 24. A question can carry more than one flag.

Two items flagged in the earlier 100-question sample were judged clean on this full pass, so their flags were cleared: the Mansarovar rivers item (`673ef8b97807c37c6a9055a0`) and the Pichwai / Phad item (`6a2e146c5aec195a986b3ff9`).

Verdicts: `backend/reports/Reports_p0/bank-verify-sample-2026-09-29T23-57-38-842Z.json`.

`/api/user-quiz` and `/api/random-questions` skip `reviewExcludeFromQuiz` only in this backend. The deployed Vercel app still serves the 332 withheld questions until this code is deployed.

## Close-out

Pass 4 was skipped. The script `backend/scripts/script_P0/close-p05-audit.js` applied the safe structural fixes on 30 Sep 2026 and computed Wilson 95% intervals from the full gpt-4o verdicts. A second dry run wrote nothing and confirmed the saved option positions.

### Structure

| Finding | Outcome |
|---|---|
| Duplicate option (`6a289b9302edc9a2514a5fa7`, Puthari listed twice) | Removed the repeated option. Three distinct options remain, and the key still matches one of them. |
| Two “markdown” hits | Left unchanged. Both are underscore blanks (`____`, `___`), not Markdown. |
| Subdomain label | 434 questions now use the parent document’s label. Those were the same topic after splitting camelCase, or the question label was a shorter form of the parent (`bollywood` inside Bollywood Movies, `scienceAndTechnology` inside Science and Technology in India). |
| Correct answer in the first option | Reshuffled 6,037 questions whose options do not depend on position. The four slots are now 1,588 / 1,593 / 1,576 / 1,588 (about 25% each). Answer text was not changed. Past attempts store the chosen text, so old scores stay valid. |
| Duplicate pairs at 0.85 | Nothing to purge. |

Left in place, because changing them would rename a different topic or a junk category:

- 31 Tollywood questions still filed under Bollywood Movies.
- 34 Indian-music questions still filed under Bollywood Songs.
- 77 questions in the category `Scienftrfvrfce`, which is not in the app taxonomy. Three of them are labeled Geography, History, and Entertainment inside a Physics document.
- 32 questions with options such as “all of the above.” Their order was not shuffled.

`--shuffle` is not idempotent and has already been applied. Do not pass it again.

### Defect rates

A wrong key means gpt-4o did not mark the stored answer correct. “Any concern” also counts a missing single defensible option, an explanation that does not support the key, or a non-`none` flag. Intervals are Wilson 95%. This is the model’s judgment of the bank, not a hand score. Low-confidence wrong keys stay servable; only a wrong key at confidence 0.7 or higher is withheld.

Bank-wide, n = 6,345: wrong key 498 (7.85%, 7.21–8.54%). Any concern 570 (8.98%, 8.30–9.71%).

| Category | n | Wrong key | 95% interval |
|---|---:|---:|---|
| current affairs | 611 | 12.44% | 10.05–15.29% |
| entertainment | 769 | 12.09% | 9.98–14.59% |
| Scienftrfvrfce | 77 | 11.69% | 6.27–20.75% |
| art | 236 | 11.44% | 7.98–16.13% |
| geography | 791 | 8.34% | 6.61–10.48% |
| sports | 221 | 8.14% | 5.21–12.51% |
| religion | 898 | 7.35% | 5.82–9.24% |
| culture | 130 | 6.15% | 3.15–11.67% |
| politics | 882 | 6.12% | 4.72–7.90% |
| generalknowledge | 646 | 5.11% | 3.66–7.09% |
| history | 893 | 4.48% | 3.31–6.04% |
| cuisine | 191 | 4.19% | 2.14–8.05% |

By question id timestamp:

| Quarter | n | Wrong key | 95% interval |
|---|---:|---:|---|
| 2026 Q3 | 671 | 10.28% | 8.21–12.81% |
| 2026 Q2 | 1,477 | 8.80% | 7.46–10.36% |
| 2026 Q1 | 3,072 | 8.20% | 7.28–9.23% |
| 2025 Q4 | 112 | 6.25% | 3.06–12.34% |
| 2025 Q2 | 238 | 4.20% | 2.30–7.56% |
| 2024 Q4 | 775 | 3.87% | 2.72–5.47% |

Religion and politics sit below the bank-wide wrong-key rate. Current affairs and entertainment are the high strata. Newer questions are worse than the 2024 slice.

Numbers: `backend/reports/Reports_p0/p05-closeout-2026-09-30T00-32-32-199Z.json`.

### Launch call

Recorded 29 Sep 2026.

Remaining quality does not block an internal cohort once this backend is deployed. High-confidence wrong keys are withheld from `/api/user-quiz` and `/api/random-questions`, and the option-order skew is fixed in the live bank.

Remaining quality does block a claim that the served bank is fact-checked. Pass 4 was skipped, so the miss rate on the 5,775 items the model called clean was not measured. 238 flagged questions stay in rotation. The deployed Vercel app still serves the 332 withheld questions until this backend is deployed.

The Sunday generation cron is still scheduled.

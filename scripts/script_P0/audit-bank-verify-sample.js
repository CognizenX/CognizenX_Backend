/**
 * P0.5 pass 3 sample. Judges a random slice with gpt-4o. Does not edit the bank.
 *
 *   node scripts/script_P0/audit-bank-verify-sample.js --count 100
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const OpenAI = require("openai");

const INPUT_USD_PER_TOKEN = 2.5 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 10 / 1_000_000;

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shuffle(items, seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

const SYSTEM = `You are an independent trivia examiner. You did not write these questions and you must not rewrite them.
Judge the marked answer against the options and the explanation.
Prefer "false" plus a low confidence over guessing when the item depends on a claim you cannot support.
Return only JSON with this shape:
{
  "marked_answer_correct": boolean,
  "exactly_one_defensible_option": boolean,
  "explanation_supports_answer": boolean,
  "flags": ["none" | "ambiguous" | "dated" | "culturally_awkward" | "wrong_key" | "bad_explanation"],
  "confidence": number,
  "reason": string
}
confidence is from 0 to 1. reason is at most 30 words.`;

async function judge(client, item, attempts) {
  const user = `Category: ${item.category}
Subdomain: ${item.subDomain}
Question: ${item.question}
Options: ${item.options.map((option, index) => `${index + 1}. ${option}`).join("\n")}
Marked answer: ${item.answer}
Explanation: ${item.explanation}`;

  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4o",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
      });
      const text = completion.choices[0]?.message?.content || "{}";
      const verdict = JSON.parse(text);
      return {
        verdict,
        usage: completion.usage || {},
      };
    } catch (error) {
      lastError = error;
      const message = String(error?.message || "").toLowerCase();
      const waitMs = error?.status === 429 || message.includes("rate") ? 5000 * attempt : 800 * attempt;
      if (attempt < attempts) await sleep(waitMs);
    }
  }
  throw lastError;
}

async function main() {
  const count = Math.max(1, Number(argValue("--count", "100")) || 100);
  const concurrency = Math.max(1, Number(argValue("--concurrency", "6")) || 6);
  const seed = Number(argValue("--seed", String(Date.now() % 100000))) || 1;
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");

  await mongoose.connect(process.env.MONGO_URI);
  const docs = await mongoose.connection.collection("triviacategories")
    .find({}, { projection: { category: 1, subDomain: 1, "questions._id": 1, "questions.question": 1, "questions.options": 1, "questions.correct_answer": 1, "questions.correctAnswer": 1, "questions.explanation": 1 } })
    .toArray();

  const pool = [];
  for (const doc of docs) {
    for (const question of doc.questions || []) {
      const answer = String(question.correct_answer || question.correctAnswer || "").trim();
      if (!answer || !String(question.question || "").trim()) continue;
      pool.push({
        questionId: String(question._id),
        category: doc.category,
        subDomain: doc.subDomain,
        question: question.question,
        options: question.options || [],
        answer,
        explanation: String(question.explanation || "").trim(),
      });
    }
  }

  const sample = shuffle(pool, seed).slice(0, Math.min(count, pool.length));
  await mongoose.disconnect();

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(__dirname, "..", "..", "reports", "Reports_p0");
  fs.mkdirSync(dir, { recursive: true });
  const jsonlPath = path.join(dir, `bank-verify-full-${stamp}.jsonl`);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const results = [];
  let cursor = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let finished = 0;

  async function worker() {
    while (cursor < sample.length) {
      const item = sample[cursor];
      cursor += 1;
      let row;
      try {
        const judged = await judge(client, item, 4);
        inputTokens += Number(judged.usage.prompt_tokens || 0);
        outputTokens += Number(judged.usage.completion_tokens || 0);
        row = {
          questionId: item.questionId,
          category: item.category,
          subDomain: item.subDomain,
          verdict: judged.verdict,
          inputTokens: judged.usage.prompt_tokens || 0,
          outputTokens: judged.usage.completion_tokens || 0,
        };
      } catch (error) {
        row = {
          questionId: item.questionId,
          category: item.category,
          subDomain: item.subDomain,
          error: error?.message || String(error),
        };
      }
      results.push(row);
      fs.appendFileSync(jsonlPath, `${JSON.stringify(row)}\n`);
      finished += 1;
      if (finished % 100 === 0 || finished === sample.length) {
        console.log(`[verify] ${finished}/${sample.length} tokens in ${inputTokens} out ${outputTokens}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, sample.length) }, () => worker()));

  const judged = results.filter((row) => row.verdict);
  const failed = results.length - judged.length;
  const tally = {
    markedAnswerCorrect: 0,
    exactlyOne: 0,
    explanationSupports: 0,
    lowConfidence: 0,
    anyConcern: 0,
  };
  const flagCounts = {};
  for (const row of judged) {
    const verdict = row.verdict;
    if (verdict.marked_answer_correct === true) tally.markedAnswerCorrect += 1;
    if (verdict.exactly_one_defensible_option === true) tally.exactlyOne += 1;
    if (verdict.explanation_supports_answer === true) tally.explanationSupports += 1;
    const confidence = Number(verdict.confidence);
    if (!Number.isFinite(confidence) || confidence < 0.7) tally.lowConfidence += 1;
    const flags = Array.isArray(verdict.flags) ? verdict.flags.filter((flag) => flag && flag !== "none") : [];
    const concern = verdict.marked_answer_correct !== true || verdict.exactly_one_defensible_option !== true || verdict.explanation_supports_answer !== true || flags.length > 0;
    if (concern) tally.anyConcern += 1;
    for (const flag of flags) flagCounts[flag] = (flagCounts[flag] || 0) + 1;
  }

  const usd = inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN;
  const summary = {
    generatedAt: new Date().toISOString(),
    model: "gpt-4o",
    seed,
    requested: count,
    poolSize: pool.length,
    judged: judged.length,
    failedCalls: failed,
    tally,
    flagCounts,
    rates: judged.length ? {
      markedAnswerCorrect: Number((tally.markedAnswerCorrect / judged.length).toFixed(4)),
      exactlyOneDefensible: Number((tally.exactlyOne / judged.length).toFixed(4)),
      explanationSupports: Number((tally.explanationSupports / judged.length).toFixed(4)),
      clean: Number(((judged.length - tally.anyConcern) / judged.length).toFixed(4)),
    } : {},
    tokens: { inputTokens, outputTokens },
    listPriceUsd: Number(usd.toFixed(4)),
    listPricePerQuestionUsd: judged.length ? Number((usd / judged.length).toFixed(6)) : null,
    fullBankListPriceUsd: judged.length ? Number(((usd / judged.length) * pool.length).toFixed(2)) : null,
    concerns: judged
      .filter((row) => {
        const verdict = row.verdict;
        const flags = Array.isArray(verdict.flags) ? verdict.flags.filter((flag) => flag && flag !== "none") : [];
        return verdict.marked_answer_correct !== true || verdict.exactly_one_defensible_option !== true || verdict.explanation_supports_answer !== true || flags.length > 0 || Number(verdict.confidence) < 0.7;
      })
      .map((row) => ({
        questionId: row.questionId,
        category: row.category,
        subDomain: row.subDomain,
        verdict: row.verdict,
      })),
  };

  const stampOut = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(dir, `bank-verify-sample-${stampOut}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`report ${outPath}`);
  console.log(`checkpoint ${jsonlPath}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});

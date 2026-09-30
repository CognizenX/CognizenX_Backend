/**
 * P0.5 passes 1 and 2. Report only. Does not update or delete questions.
 *
 *   node scripts/script_P0/audit-bank.js
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const PURGE_THRESHOLD = 0.85;
const REVIEW_THRESHOLD = 0.75;

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function parent(parents, index) {
  if (parents[index] !== index) parents[index] = parent(parents, parents[index]);
  return parents[index];
}

function unite(parents, a, b) {
  const pa = parent(parents, a);
  const pb = parent(parents, b);
  if (pa !== pb) parents[pb] = pa;
}

function structuralIssues(doc, question) {
  const issues = [];
  const options = Array.isArray(question.options) ? question.options.map((option) => String(option || "")) : [];
  const normalizedOptions = options.map(normalize).filter(Boolean);
  const snake = String(question.correct_answer || "").trim();
  const camel = String(question.correctAnswer || "").trim();
  const answer = snake || camel;

  if (!String(question.question || "").trim()) issues.push("empty_question");
  if (options.length < 2) issues.push("too_few_options");
  if (options.some((option) => !option.trim())) issues.push("empty_option");
  if (new Set(normalizedOptions).size !== normalizedOptions.length) issues.push("duplicate_options");
  if (snake && camel && normalize(snake) !== normalize(camel)) issues.push("answer_fields_disagree");
  if (!answer) issues.push("missing_answer");
  else if (!normalizedOptions.includes(normalize(answer))) issues.push("answer_not_in_options");
  if (!String(question.explanation || "").trim()) issues.push("missing_explanation");
  if (!Array.isArray(question.embedding) || question.embedding.length === 0) issues.push("missing_embedding");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/.test(`${question.question || ""}${options.join("")}${answer}`)) {
    issues.push("encoding");
  }
  if (/(`|\*\*|__|^\s*#)/m.test(String(question.question || ""))) issues.push("markdown");
  const questionSub = String(question.subDomain || "").trim();
  if (questionSub && normalize(questionSub) !== normalize(doc.subDomain)) issues.push("subdomain_mismatch");

  let answerPosition = null;
  if (answer) {
    answerPosition = normalizedOptions.indexOf(normalize(answer));
  }

  return { issues, answerPosition, optionCount: options.length };
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI);
  const docs = await mongoose.connection.collection("triviacategories")
    .find({}, { projection: { category: 1, subDomain: 1, questions: 1 } })
    .toArray();

  const issueCounts = {};
  const issueExamples = {};
  const positionCounts = [0, 0, 0, 0];
  let positioned = 0;
  let total = 0;
  const pass3Chars = [];

  const purgePairs = [];
  const reviewClusters = [];
  let missingEmbedding = 0;
  let clusteredQuestions = 0;

  for (const doc of docs) {
    const questions = Array.isArray(doc.questions) ? doc.questions : [];
    total += questions.length;
    const embedded = [];

    questions.forEach((question, index) => {
      const { issues, answerPosition, optionCount } = structuralIssues(doc, question);
      for (const issue of issues) {
        issueCounts[issue] = (issueCounts[issue] || 0) + 1;
        if (!issueExamples[issue]) {
          issueExamples[issue] = {
            category: doc.category,
            subDomain: doc.subDomain,
            questionId: String(question._id || ""),
            optionCount,
          };
        }
      }
      if (issues.includes("missing_embedding")) missingEmbedding += 1;
      if (answerPosition != null && answerPosition >= 0 && answerPosition < 4) {
        positionCounts[answerPosition] += 1;
        positioned += 1;
      }

      const optionText = (question.options || []).join(" | ");
      const answer = question.correct_answer || question.correctAnswer || "";
      pass3Chars.push(
        String(question.question || "").length +
        optionText.length +
        String(answer).length +
        String(question.explanation || "").length
      );

      if (Array.isArray(question.embedding) && question.embedding.length) {
        embedded.push({
          index,
          id: String(question._id || index),
          createdAt: question.createdAt || null,
          embedding: question.embedding,
        });
      }
    });

    const parents = embedded.map((_, index) => index);
    for (let i = 0; i < embedded.length; i += 1) {
      for (let j = i + 1; j < embedded.length; j += 1) {
        const score = cosine(embedded[i].embedding, embedded[j].embedding);
        if (score >= PURGE_THRESHOLD) {
          purgePairs.push({
            category: doc.category,
            subDomain: doc.subDomain,
            score: Number(score.toFixed(4)),
            keepQuestionId: embedded[i].id,
            dropQuestionId: embedded[j].id,
          });
          unite(parents, i, j);
        } else if (score >= REVIEW_THRESHOLD) {
          unite(parents, i, j);
        }
      }
    }

    const groups = new Map();
    embedded.forEach((entry, index) => {
      const root = parent(parents, index);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(entry.id);
    });
    let bucketClustered = 0;
    for (const ids of groups.values()) {
      if (ids.length < 2) continue;
      bucketClustered += ids.length;
      reviewClusters.push({
        category: doc.category,
        subDomain: doc.subDomain,
        size: ids.length,
        questionIds: ids,
      });
    }
    clusteredQuestions += bucketClustered;
  }

  pass3Chars.sort((a, b) => a - b);
  const at = (p) => pass3Chars[Math.min(pass3Chars.length - 1, Math.floor(pass3Chars.length * p))] || 0;
  const fixedPromptChars = 900;
  const inputTokens = pass3Chars.reduce((sum, chars) => sum + Math.ceil((chars + fixedPromptChars) / 4), 0);
  const outputTokens = total * 120;

  const report = {
    generatedAt: new Date().toISOString(),
    totalQuestions: total,
    pass1: {
      issueCounts,
      issueExamples,
      answerPosition: {
        counts: positionCounts,
        shareFirst: positioned ? Number((positionCounts[0] / positioned).toFixed(4)) : null,
        positioned,
      },
    },
    pass2: {
      missingEmbedding,
      purgeCandidatePairs: purgePairs.length,
      reviewClusterCount: reviewClusters.length,
      questionsInReviewClusters: clusteredQuestions,
      largestClusters: [...reviewClusters].sort((a, b) => b.size - a.size).slice(0, 15),
    },
    pass3Cost: {
      modelNote: "Verifier should not be the generator model (gpt-4). Output assumes a 120-token JSON verdict.",
      questions: total,
      inputTokens,
      outputTokens,
      contentChars: { p50: at(0.5), p95: at(0.95) },
      listPriceUsd: {
        "gpt-4o": Number(((inputTokens * 2.5 + outputTokens * 10) / 1_000_000).toFixed(2)),
        "gpt-4o-mini": Number(((inputTokens * 0.15 + outputTokens * 0.6) / 1_000_000).toFixed(2)),
        "gpt-4": Number(((inputTokens * 30 + outputTokens * 60) / 1_000_000).toFixed(2)),
      },
    },
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(__dirname, "..", "..", "reports", "Reports_p0");
  fs.mkdirSync(dir, { recursive: true });
  const summaryPath = path.join(dir, `bank-audit-${stamp}.summary.json`);
  const purgePath = path.join(dir, `bank-audit-${stamp}.purge-pairs.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(purgePath, JSON.stringify(purgePairs, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`summary ${summaryPath}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error?.message || error);
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  process.exit(1);
});

/**
 * P0.5 close-out helpers.
 *
 *   node scripts/script_P0/close-p05-audit.js --verify reports/Reports_p0/bank-verify-sample-....json
 *   node scripts/script_P0/close-p05-audit.js --verify reports/Reports_p0/....json --apply
 *   node scripts/script_P0/close-p05-audit.js --shuffle
 *
 * --shuffle was applied once on 30 Sep 2026. It is not idempotent. Do not pass it again.
 *
 * Dry-run prints safe structural fixes and Wilson intervals. --apply writes:
 * - question subDomain labels that match the parent, or whose folded label is contained in the parent label
 * - markdown markers stripped from the question text
 * - exact duplicate options removed when two or more distinct options remain
 * - option order reshuffled when no option depends on position
 *
 * The marked answer string is not changed. Real subdomain disagreements are left.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const Z = 1.96;

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function fold(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_/]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMarkdown(text) {
  return String(text || "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*|`/g, "")
    .trim();
}

function hasMarkdown(text) {
  return /(`|\*\*|^\s{0,3}#{1,6}\s+)/m.test(String(text || ""));
}

function dedupeOptions(options) {
  const seen = new Set();
  const next = [];
  for (const option of options) {
    const key = normalize(option);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(option);
  }
  return next;
}

function orderSensitive(options) {
  const blob = options.join("\n").toLowerCase();
  if (/\b(all|none|both|neither) of (the )?(above|these|them)\b/.test(blob)) return true;
  if (/\b(both|either)\s+[a-d]\s+(and|or|&)\s+[a-d]\b/.test(blob)) return true;
  if (/\boptions?\s+[a-d]\b/.test(blob)) return true;
  return options.some((option) => /^[\s]*[a-d](\s*(and|&|or|,)\s*[a-d])+[\s.]*$/i.test(option));
}

function hashSeed(id) {
  let hash = 2166136261;
  const text = String(id);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffleOptions(options, seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const copy = options.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function answerIndex(options, answer) {
  return options.map(normalize).indexOf(normalize(answer));
}

function wilson(successes, total) {
  if (!total) return null;
  const p = successes / total;
  const z2 = Z * Z;
  const denom = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = Z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  const low = Math.max(0, (centre - margin) / denom);
  const high = Math.min(1, (centre + margin) / denom);
  return {
    n: total,
    k: successes,
    rate: Number(p.toFixed(4)),
    low: Number(low.toFixed(4)),
    high: Number(high.toFixed(4)),
  };
}

function quarterKey(questionId) {
  const seconds = parseInt(String(questionId).slice(0, 8), 16);
  if (!Number.isFinite(seconds)) return "unknown";
  const date = new Date(seconds * 1000);
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${date.getUTCFullYear()}-Q${quarter}`;
}

function isConcern(verdict) {
  const flags = Array.isArray(verdict.flags) ? verdict.flags.filter((flag) => flag && flag !== "none") : [];
  return verdict.marked_answer_correct !== true
    || verdict.exactly_one_defensible_option !== true
    || verdict.explanation_supports_answer !== true
    || flags.length > 0;
}

function tallyRows(rows) {
  const wrong = rows.filter((row) => row.verdict.marked_answer_correct !== true).length;
  const concern = rows.filter((row) => isConcern(row.verdict)).length;
  return {
    n: rows.length,
    wrongKey: wilson(wrong, rows.length),
    anyConcern: wilson(concern, rows.length),
  };
}

function groupStrata(results) {
  const byCategory = new Map();
  const byQuarter = new Map();
  for (const row of results) {
    if (!row.verdict) continue;
    const category = row.category || "unknown";
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(row);
    const quarter = quarterKey(row.questionId);
    if (!byQuarter.has(quarter)) byQuarter.set(quarter, []);
    byQuarter.get(quarter).push(row);
  }
  const toList = (map) => Array.from(map.entries())
    .map(([name, rows]) => ({ name, ...tallyRows(rows) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { byCategory: toList(byCategory), byQuarter: toList(byQuarter), overall: tallyRows(results.filter((row) => row.verdict)) };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const shuffle = process.argv.includes("--shuffle");
  const verifyPath = argValue("--verify");
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");

  let strata = null;
  if (verifyPath) {
    const report = JSON.parse(fs.readFileSync(verifyPath, "utf8"));
    strata = groupStrata(report.results || []);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const collection = mongoose.connection.collection("triviacategories");
  const docs = await collection.find({}, {
    projection: {
      category: 1,
      subDomain: 1,
      "questions._id": 1,
      "questions.question": 1,
      "questions.options": 1,
      "questions.correct_answer": 1,
      "questions.correctAnswer": 1,
      "questions.subDomain": 1,
    },
  }).toArray();

  const ops = [];
  const preview = {
    markdown: [],
    duplicateOptions: [],
    subdomainAligned: 0,
    subdomainLeft: [],
    shuffled: 0,
    orderSensitiveLeft: 0,
    positionBefore: [0, 0, 0, 0],
    positionAfter: [0, 0, 0, 0],
  };
  const leftBuckets = new Map();
  const leftSamples = new Map();

  for (const doc of docs) {
    for (const question of doc.questions || []) {
      const options = Array.isArray(question.options) ? question.options.map((option) => String(option || "")) : [];
      const answer = String(question.correct_answer || question.correctAnswer || "").trim();
      const beforeIndex = answerIndex(options, answer);
      if (beforeIndex >= 0 && beforeIndex < 4) preview.positionBefore[beforeIndex] += 1;

      const set = {};
      let nextOptions = options.slice();

      const questionSub = String(question.subDomain || "").trim();
      const parentSub = String(doc.subDomain || "").trim();
      if (questionSub && normalize(questionSub) !== normalize(parentSub)) {
        const childFold = fold(questionSub);
        const parentFold = fold(parentSub);
        const sameTopic = childFold === parentFold
          || (childFold.length >= 8 && parentFold.includes(childFold));
        if (sameTopic) {
          set["questions.$.subDomain"] = parentSub;
          preview.subdomainAligned += 1;
        } else {
          const key = `${doc.category} | ${parentSub} | ${questionSub}`;
          leftBuckets.set(key, (leftBuckets.get(key) || 0) + 1);
          if (!leftSamples.has(key)) leftSamples.set(key, []);
          if (leftSamples.get(key).length < 2) {
            leftSamples.get(key).push({
              questionId: String(question._id),
              question: String(question.question || "").slice(0, 180),
            });
          }
        }
      }

      if (hasMarkdown(question.question)) {
        const stripped = stripMarkdown(question.question);
        if (stripped && stripped !== question.question) {
          set["questions.$.question"] = stripped;
          preview.markdown.push({
            questionId: String(question._id),
            before: question.question,
            after: stripped,
          });
        }
      }

      const deduped = dedupeOptions(nextOptions);
      if (deduped.length !== nextOptions.length && deduped.length >= 2 && answerIndex(deduped, answer) >= 0) {
        nextOptions = deduped;
        preview.duplicateOptions.push({
          questionId: String(question._id),
          category: doc.category,
          subDomain: parentSub,
          before: options,
          after: deduped,
        });
      }

      if (shuffle && orderSensitive(nextOptions)) {
        preview.orderSensitiveLeft += 1;
      } else if (shuffle && nextOptions.length >= 2) {
        const shuffled = shuffleOptions(nextOptions, hashSeed(question._id));
        if (shuffled.some((option, index) => option !== nextOptions[index])) {
          nextOptions = shuffled;
          preview.shuffled += 1;
        }
      }

      if (nextOptions !== options && nextOptions.some((option, index) => option !== options[index])) {
        set["questions.$.options"] = nextOptions;
      }

      const afterIndex = answerIndex(nextOptions, answer);
      if (afterIndex >= 0 && afterIndex < 4) preview.positionAfter[afterIndex] += 1;

      if (Object.keys(set).length) {
        ops.push({
          updateOne: {
            filter: { _id: doc._id, "questions._id": question._id },
            update: { $set: set },
          },
        });
      }
    }
  }

  preview.subdomainLeft = Array.from(leftBuckets.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  if (apply && ops.length) {
    for (let i = 0; i < ops.length; i += 200) {
      await collection.bulkWrite(ops.slice(i, i + 200), { ordered: false });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    applied: apply,
    fixes: {
      writes: ops.length,
      markdown: preview.markdown,
      duplicateOptions: preview.duplicateOptions,
      subdomainAligned: preview.subdomainAligned,
      subdomainLeft: preview.subdomainLeft,
      shuffled: preview.shuffled,
      orderSensitiveLeft: preview.orderSensitiveLeft,
      positionBefore: preview.positionBefore,
      positionAfter: preview.positionAfter,
    },
    strata,
    defectDefinition: {
      wrongKey: "gpt-4o marked_answer_correct is not true",
      anyConcern: "wrong key, not exactly one defensible option, explanation does not support the answer, or a non-none flag",
      interval: "Wilson 95% interval",
    },
  };

  const dir = path.join(__dirname, "..", "..", "reports", "Reports_p0");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(dir, `p05-closeout-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    applied: apply,
    writes: ops.length,
    markdown: preview.markdown.length,
    duplicateOptions: preview.duplicateOptions.length,
    subdomainAligned: preview.subdomainAligned,
    subdomainLeftGroups: preview.subdomainLeft.length,
    subdomainLeftQuestions: preview.subdomainLeft.reduce((sum, row) => sum + row.count, 0),
    shuffled: preview.shuffled,
    orderSensitiveLeft: preview.orderSensitiveLeft,
    positionBefore: preview.positionBefore,
    positionAfter: preview.positionAfter,
    subdomainLeft: preview.subdomainLeft,
    subdomainLeftSamples: Array.from(leftSamples.entries()).map(([key, samples]) => ({ key, samples })),
    byCategory: strata && strata.byCategory,
    byQuarter: strata && strata.byQuarter,
    markdownPreview: preview.markdown,
    duplicatePreview: preview.duplicateOptions,
    overall: strata && strata.overall,
    report: outPath,
  }, null, 2));
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});

/**
 * Migration: Mythology -> Religion taxonomy
 *
 * What it does:
 * 1) Rebuilds triviacategories docs for category mythology/religion into canonical religion subdomains
 * 2) Normalizes category/subDomain in triviaattempts, userquestionstats, schedulermetadatas
 * 3) Normalizes useractivities.categories[] (category + domain)
 *
 * Usage:
 *   node scripts/migrate-mythology-to-religion.js --dry-run
 *   node scripts/migrate-mythology-to-religion.js
 *   node scripts/migrate-mythology-to-religion.js --fallback-subdomain=jainism
 *   node scripts/migrate-mythology-to-religion.js --ai-model=gpt-4o-mini
 *   node scripts/migrate-mythology-to-religion.js --no-ai
 */

require("dotenv").config();
const mongoose = require("mongoose");
const OpenAI = require("openai");
const TriviaCategory = require("../models/TriviaCategory");
const TriviaAttempt = require("../models/TriviaAttempt");
const UserQuestionStats = require("../models/UserQuestionStats");
const SchedulerMetadata = require("../models/SchedulerMetadata");
const UserActivity = require("../models/UserActivity");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const AI_DISABLED = args.includes("--no-ai");
const FALLBACK_SUBDOMAIN_ARG = args.find((a) => a.startsWith("--fallback-subdomain="));
const FALLBACK_SUBDOMAIN = (FALLBACK_SUBDOMAIN_ARG
  ? FALLBACK_SUBDOMAIN_ARG.split("=")[1]
  : "jainism").trim().toLowerCase();
const AI_MODEL_ARG = args.find((a) => a.startsWith("--ai-model="));
const AI_MODEL = (AI_MODEL_ARG ? AI_MODEL_ARG.split("=")[1] : "gpt-4o-mini").trim();
const START_TS = Date.now();
const PROGRESS_EVERY_DOCS = 10;
const PROGRESS_EVERY_QUESTIONS = 50;

const ALLOWED_RELIGION_SUBDOMAINS = ["hindu", "islam", "christianity", "sikhism", "buddhism", "jainism"];

const hasApiKey = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 20);
const AI_ENABLED = !AI_DISABLED && hasApiKey;
const openai = AI_ENABLED
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const aiClassificationCache = new Map();

const RELIGION_SUBDOMAIN_ALIASES = {
  hindu: ["hindu", "hindo", "hindu mythology", "sanatan", "sanatan dharma"],
  islam: ["islam", "islamic", "muslim", "muslims", "quranic"],
  christianity: ["christianity", "christinanity", "christian", "christians", "catholic", "protestant"],
  sikhism: ["sikhism", "sikh", "sikhs"],
  buddhism: ["buddhism", "buddhist", "buddha", "buddhists"],
  jainism: ["jainism", "jain", "jains", "mahavira"],
};

const OTHER_MYTHOLOGIES_ALIASES = new Set([
  "other mythology",
  "other mythologies",
  "others mythology",
  "others mythologies",
  "mythology",
]);

const RELIGION_KEYWORDS = {
  hindu: [
    "hindu", "ramayana", "mahabharata", "veda", "upanishad", "krishna", "rama", "shiva", "vishnu", "durga", "ganesha",
  ],
  islam: [
    "islam", "muslim", "quran", "hadith", "allah", "muhammad", "mecca", "medina", "ramadan", "eid", "mosque",
  ],
  christianity: [
    "christian", "christianity", "jesus", "bible", "gospel", "church", "easter", "christmas", "apostle", "vatican",
  ],
  sikhism: [
    "sikh", "sikhism", "guru granth sahib", "gurdwara", "khalsa", "amritsar", "golden temple", "punj pyare",
  ],
  buddhism: [
    "buddha", "buddhist", "buddhism", "dharma", "sangha", "nirvana", "bodhi", "tripitaka", "dalai lama",
  ],
  jainism: [
    "jain", "jainism", "tirthankara", "mahavira", "ahimsa", "parshvanatha", "digambara", "svetambara",
  ],
};

function toKey(value) {
  return String(value || "").trim().toLowerCase();
}

function log(message) {
  const elapsedSec = ((Date.now() - START_TS) / 1000).toFixed(1);
  console.log(`[MIGRATE +${elapsedSec}s] ${message}`);
}

function canonicalCategory(category) {
  const key = toKey(category);
  if (key === "mythology") return "religion";
  return key;
}

function mapKnownReligionSubDomain(input) {
  const key = toKey(input);
  if (!key) return null;

  for (const [canonical, aliases] of Object.entries(RELIGION_SUBDOMAIN_ALIASES)) {
    if (aliases.includes(key)) {
      return canonical;
    }
  }

  if (OTHER_MYTHOLOGIES_ALIASES.has(key)) {
    return null;
  }

  return null;
}

function classifyReligionFromText(text) {
  const normalized = toKey(text);
  if (!normalized) return null;

  let bestCategory = null;
  let bestScore = 0;

  for (const [candidate, keywords] of Object.entries(RELIGION_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (normalized.includes(keyword)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = candidate;
    }
  }

  return bestScore > 0 ? bestCategory : null;
}

function questionToText(question) {
  const optionsText = Array.isArray(question?.options) ? question.options.join(" ") : "";
  return [
    question?.question,
    optionsText,
    question?.correct_answer,
    question?.correctAnswer,
    question?.explanation,
  ]
    .filter(Boolean)
    .join(" ");
}

function isOtherMythologies(value) {
  return OTHER_MYTHOLOGIES_ALIASES.has(toKey(value));
}

async function classifyReligionWithAI(question) {
  if (!AI_ENABLED || !question) {
    return null;
  }

  const text = questionToText(question);
  const cacheKey = toKey(text);
  if (!cacheKey) {
    return null;
  }

  if (aiClassificationCache.has(cacheKey)) {
    return aiClassificationCache.get(cacheKey);
  }

  const prompt = [
    "Classify this trivia question into exactly one religion subdomain.",
    `Allowed labels: ${ALLOWED_RELIGION_SUBDOMAINS.join(", ")}`,
    "Respond with ONLY valid JSON like:",
    '{"subDomain":"hindu"}',
    "If uncertain, choose the closest label from allowed labels.",
    `Question content: ${text}`,
  ].join("\n");

  try {
    log("AI classify: sending question to model...");
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      temperature: 0,
      max_tokens: 30,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a strict taxonomy classifier. Return only JSON with a single key subDomain.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = completion.choices?.[0]?.message?.content?.trim();
    const parsed = JSON.parse(content || "{}");
    const candidate = toKey(parsed.subDomain);
    const normalized = ALLOWED_RELIGION_SUBDOMAINS.includes(candidate) ? candidate : null;

    aiClassificationCache.set(cacheKey, normalized);
    log(`AI classify: result=${normalized || "null"}`);
    return normalized;
  } catch (error) {
    console.warn("AI classification failed; falling back to keyword/default strategy:", error.message);
    aiClassificationCache.set(cacheKey, null);
    return null;
  }
}

async function resolveReligionSubDomain({ sourceSubDomain, question }) {
  const known = mapKnownReligionSubDomain(sourceSubDomain);
  if (known) return { subDomain: known, reason: "alias" };

  if (isOtherMythologies(sourceSubDomain)) {
    const fromAI = await classifyReligionWithAI(question);
    if (fromAI) return { subDomain: fromAI, reason: "ai" };
  }

  const fromQuestion = classifyReligionFromText(questionToText(question));
  if (fromQuestion) return { subDomain: fromQuestion, reason: "question-keywords" };

  return { subDomain: FALLBACK_SUBDOMAIN, reason: "fallback" };
}

function dedupeQuestionsPreserveIds(questions) {
  const seenById = new Set();
  const seenByText = new Set();
  const unique = [];

  for (const q of questions) {
    const qId = q?._id ? String(q._id) : "";
    if (qId && seenById.has(qId)) {
      continue;
    }

    const textKey = toKey(q?.question);
    const optionsKey = Array.isArray(q?.options) ? q.options.map((o) => toKey(o)).join("|") : "";
    const combinedKey = `${textKey}::${optionsKey}`;

    if (!qId && combinedKey && seenByText.has(combinedKey)) {
      continue;
    }

    if (qId) {
      seenById.add(qId);
    } else if (combinedKey) {
      seenByText.add(combinedKey);
    }

    unique.push(q);
  }

  return unique;
}

async function migrateTriviaCategories() {
  log("Loading source TriviaCategory documents...");
  const sourceDocs = await TriviaCategory.find({
    category: { $in: ["mythology", "Mythology", "religion", "Religion"] },
  }).lean();
  log(`Loaded ${sourceDocs.length} source TriviaCategory document(s).`);

  const aggregates = new Map();
  let totalQuestions = 0;
  let fallbackRouted = 0;
  let aiRouted = 0;
  let keywordRouted = 0;
  let aliasRouted = 0;
  let processedDocs = 0;
  let processedQuestions = 0;

  for (const doc of sourceDocs) {
    processedDocs += 1;
    if (processedDocs % PROGRESS_EVERY_DOCS === 0 || processedDocs === sourceDocs.length) {
      log(`Progress: processed ${processedDocs}/${sourceDocs.length} category docs.`);
    }

    const category = canonicalCategory(doc.category);
    if (category !== "religion") {
      continue;
    }

    const questions = Array.isArray(doc.questions) ? doc.questions : [];
    totalQuestions += questions.length;

    if (questions.length === 0) {
      const resolved = await resolveReligionSubDomain({ sourceSubDomain: doc.subDomain, question: null });
      const key = `${category}::${resolved.subDomain}`;
      if (!aggregates.has(key)) {
        aggregates.set(key, {
          category,
          subDomain: resolved.subDomain,
          questions: [],
          seenSum: 0,
          createdAt: doc.createdAt || new Date(),
        });
      }
      const target = aggregates.get(key);
      target.seenSum += Number(doc.seen || 0);
      if (doc.createdAt && new Date(doc.createdAt) < new Date(target.createdAt)) {
        target.createdAt = doc.createdAt;
      }
      continue;
    }

    for (const question of questions) {
      processedQuestions += 1;
      if (processedQuestions % PROGRESS_EVERY_QUESTIONS === 0) {
        log(`Progress: processed ${processedQuestions} questions for categorization.`);
      }

      const resolved = await resolveReligionSubDomain({
        sourceSubDomain: question?.subDomain || doc.subDomain,
        question,
      });

      if (resolved.reason === "alias") {
        aliasRouted += 1;
      }
      if (resolved.reason === "ai") {
        aiRouted += 1;
      }
      if (resolved.reason === "question-keywords") {
        keywordRouted += 1;
      }
      if (resolved.reason === "fallback") {
        fallbackRouted += 1;
      }

      const key = `${category}::${resolved.subDomain}`;
      if (!aggregates.has(key)) {
        aggregates.set(key, {
          category,
          subDomain: resolved.subDomain,
          questions: [],
          seenSum: 0,
          createdAt: doc.createdAt || new Date(),
        });
      }

      const target = aggregates.get(key);
      const clonedQuestion = {
        ...question,
        subDomain: resolved.subDomain,
      };
      target.questions.push(clonedQuestion);

      if (doc.createdAt && new Date(doc.createdAt) < new Date(target.createdAt)) {
        target.createdAt = doc.createdAt;
      }
    }

    const sourceResolved = await resolveReligionSubDomain({ sourceSubDomain: doc.subDomain, question: null });
    const sourceKey = `${category}::${sourceResolved.subDomain}`;
    if (aggregates.has(sourceKey)) {
      aggregates.get(sourceKey).seenSum += Number(doc.seen || 0);
    }
  }

  const targetDocs = Array.from(aggregates.values()).map((entry) => {
    const uniqueQuestions = dedupeQuestionsPreserveIds(entry.questions);
    const seen = Math.min(uniqueQuestions.length, Math.max(0, Number(entry.seenSum || 0)));
    return {
      category: entry.category,
      subDomain: entry.subDomain,
      questions: uniqueQuestions,
      seen,
      createdAt: entry.createdAt || new Date(),
    };
  });

  console.log("\n=== TriviaCategory Migration Summary ===");
  console.log(`Source docs: ${sourceDocs.length}`);
  console.log(`Source questions: ${totalQuestions}`);
  console.log(`Target docs: ${targetDocs.length}`);
  console.log(`Alias-routed questions: ${aliasRouted}`);
  console.log(`AI-routed questions: ${aiRouted}`);
  console.log(`Keyword-routed questions: ${keywordRouted}`);
  console.log(`Fallback-routed questions: ${fallbackRouted}`);

  for (const doc of targetDocs) {
    console.log(` - religion/${doc.subDomain}: ${doc.questions.length} questions`);
  }

  if (DRY_RUN) {
    console.log("[DRY RUN] No writes performed for triviacategories.");
    log("Dry run mode active: skipping TriviaCategory writes.");
    return;
  }

  log("Applying TriviaCategory writes...");
  if (sourceDocs.length > 0) {
    await TriviaCategory.deleteMany({ _id: { $in: sourceDocs.map((d) => d._id) } });
    log(`Deleted ${sourceDocs.length} legacy TriviaCategory doc(s).`);
  }
  if (targetDocs.length > 0) {
    await TriviaCategory.insertMany(targetDocs, { ordered: true });
    log(`Inserted ${targetDocs.length} migrated TriviaCategory doc(s).`);
  }

  console.log("TriviaCategory migration applied.");
}

function normalizeSubDomainWithoutQuestion(subDomain) {
  const known = mapKnownReligionSubDomain(subDomain);
  return known || FALLBACK_SUBDOMAIN;
}

async function migrateSimpleCollection(Model, label) {
  log(`${label}: scanning documents...`);
  const docs = await Model.find({
    category: { $in: ["mythology", "Mythology", "religion", "Religion"] },
  });

  let changed = 0;
  for (const doc of docs) {
    const nextCategory = canonicalCategory(doc.category);
    const nextSubDomain = normalizeSubDomainWithoutQuestion(doc.subDomain);

    if (doc.category !== nextCategory || doc.subDomain !== nextSubDomain) {
      doc.category = nextCategory;
      doc.subDomain = nextSubDomain;
      changed += 1;
      if (!DRY_RUN) {
        await doc.save();
      }
    }
  }

  console.log(`${label}: scanned ${docs.length}, changed ${changed}${DRY_RUN ? " (dry run)" : ""}`);
}

async function migrateUserActivities() {
  log("UserActivity: scanning documents...");
  const docs = await UserActivity.find({
    "categories.category": { $in: ["mythology", "Mythology", "religion", "Religion"] },
  });

  let changedDocs = 0;
  let changedEntries = 0;

  for (const doc of docs) {
    let docChanged = false;
    for (const item of doc.categories || []) {
      const nextCategory = canonicalCategory(item.category);
      const nextDomain = normalizeSubDomainWithoutQuestion(item.domain);

      if (item.category !== nextCategory || item.domain !== nextDomain) {
        item.category = nextCategory;
        item.domain = nextDomain;
        docChanged = true;
        changedEntries += 1;
      }
    }

    if (docChanged) {
      changedDocs += 1;
      if (!DRY_RUN) {
        await doc.save();
      }
    }
  }

  console.log(`UserActivity: scanned ${docs.length}, changed docs ${changedDocs}, changed entries ${changedEntries}${DRY_RUN ? " (dry run)" : ""}`);
}

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGO_URL;
  if (!uri) {
    console.error("ERROR: MONGO_URI or MONGO_URL environment variable is required.");
    process.exit(1);
  }

  console.log(`Running mythology->religion migration${DRY_RUN ? " [DRY RUN]" : ""}`);
  console.log(`Fallback subDomain for unclassified records: ${FALLBACK_SUBDOMAIN}`);
  console.log(
    `AI classification for 'Other Mythologies': ${AI_ENABLED ? `enabled (${AI_MODEL})` : "disabled (missing API key or --no-ai flag)"}`
  );

  log("Connecting to MongoDB...");
  await mongoose.connect(uri);
  log("MongoDB connected.");

  log("Starting migration stage: TriviaCategory");
  await migrateTriviaCategories();
  log("Starting migration stage: TriviaAttempt");
  await migrateSimpleCollection(TriviaAttempt, "TriviaAttempt");
  log("Starting migration stage: UserQuestionStats");
  await migrateSimpleCollection(UserQuestionStats, "UserQuestionStats");
  log("Starting migration stage: SchedulerMetadata");
  await migrateSimpleCollection(SchedulerMetadata, "SchedulerMetadata");
  log("Starting migration stage: UserActivity");
  await migrateUserActivities();

  await mongoose.disconnect();
  log("MongoDB disconnected.");
  console.log("Migration complete.");
}

run().catch(async (err) => {
  console.error("Migration failed:", err);
  try {
    await mongoose.disconnect();
  } catch (disconnectErr) {
    console.error("Failed to disconnect MongoDB cleanly:", disconnectErr.message);
  }
  process.exit(1);
});
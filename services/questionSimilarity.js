const OpenAI = require('openai');

let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const SEMANTIC_SIMILARITY_THRESHOLD = Number(
  process.env.SEMANTIC_SIMILARITY_THRESHOLD || 0.85
);

function normalizeQuestionText(question) {
  return String(question || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) {
    return 0;
  }

  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function findMostSimilar(candidateEmbedding, existingEntries, threshold = SEMANTIC_SIMILARITY_THRESHOLD) {
  let best = null;

  for (const entry of existingEntries) {
    const score = cosineSimilarity(candidateEmbedding, entry.embedding);
    if (score >= threshold && (!best || score > best.score)) {
      best = {
        score,
        question: entry.question,
        questionId: entry.questionId,
      };
    }
  }

  return best;
}

async function embedTexts(texts) {
  const cleaned = texts
    .map((text) => String(text || '').trim())
    .filter((text) => text.length > 0);

  if (cleaned.length === 0) {
    return [];
  }

  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim().length < 20) {
    throw new Error('OpenAI API key is not configured for embeddings.');
  }

  const response = await getOpenAIClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: cleaned,
  });

  return response.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

async function buildEmbeddingCache(questions = []) {
  const entries = [];
  const toEmbed = [];
  const toEmbedIndexes = [];

  questions.forEach((question, index) => {
    const text = normalizeQuestionText(question?.question);
    if (!text) {
      return;
    }

    const cached = Array.isArray(question?.embedding) && question.embedding.length > 0
      ? question.embedding
      : null;

    if (cached) {
      entries.push({
        questionId: question?._id ? String(question._id) : null,
        question: question.question,
        embedding: cached,
      });
      return;
    }

    toEmbed.push(text);
    toEmbedIndexes.push(index);
  });

  if (toEmbed.length > 0) {
    const embeddings = await embedTexts(toEmbed);
    embeddings.forEach((embedding, idx) => {
      const question = questions[toEmbedIndexes[idx]];
      entries.push({
        questionId: question?._id ? String(question._id) : null,
        question: question.question,
        embedding,
      });
    });
  }

  return entries;
}

async function isSemanticallyDuplicate(candidateText, existingEntries, threshold = SEMANTIC_SIMILARITY_THRESHOLD) {
  const normalized = normalizeQuestionText(candidateText);
  if (!normalized || existingEntries.length === 0) {
    return { duplicate: false, score: 0, match: null };
  }

  const [embedding] = await embedTexts([normalized]);
  const match = findMostSimilar(embedding, existingEntries, threshold);

  return {
    duplicate: Boolean(match),
    score: match?.score || 0,
    match,
    embedding,
  };
}

module.exports = {
  EMBEDDING_MODEL,
  SEMANTIC_SIMILARITY_THRESHOLD,
  normalizeQuestionText,
  cosineSimilarity,
  findMostSimilar,
  embedTexts,
  buildEmbeddingCache,
  isSemanticallyDuplicate,
};

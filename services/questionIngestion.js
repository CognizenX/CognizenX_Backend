const { formatQuestion } = require('../utils/questionFormatter');
const {
  buildEmbeddingCache,
  isSemanticallyDuplicate,
  SEMANTIC_SIMILARITY_THRESHOLD,
} = require('./questionSimilarity');

function isExactDuplicate(candidate, existingQuestions) {
  const candidateText = String(candidate?.question || '').trim().toLowerCase();
  return existingQuestions.some(
    (existing) =>
      String(existing?.question || '').trim().toLowerCase() === candidateText
  );
}

async function ingestQuestions({
  category,
  subDomain,
  candidates = [],
  existingQuestions = [],
  logPrefix = '',
  threshold = SEMANTIC_SIMILARITY_THRESHOLD,
}) {
  const accepted = [];
  const exactDuplicates = [];
  const semanticDuplicates = [];
  const rejectedSamples = [];

  const comparisonPool = await buildEmbeddingCache(existingQuestions);

  for (const raw of candidates) {
    const formatted = formatQuestion(raw, { category, subDomain, aiGenerated: raw.aiGenerated });

    if (!formatted.question || formatted.options.length < 2) {
      continue;
    }

    if (isExactDuplicate(formatted, [...existingQuestions, ...accepted])) {
      exactDuplicates.push(formatted);
      if (logPrefix) {
        console.log(
          `[INGEST] Exact duplicate skipped in ${logPrefix}: "${formatted.question.substring(0, 60)}..."`
        );
      }
      continue;
    }

    const semanticResult = await isSemanticallyDuplicate(
      formatted.question,
      comparisonPool,
      threshold
    );

    if (semanticResult.duplicate) {
      semanticDuplicates.push({
        question: formatted.question,
        score: semanticResult.score,
        matchedQuestion: semanticResult.match?.question,
      });
      rejectedSamples.push(formatted.question);
      if (logPrefix) {
        console.log(
          `[INGEST] Semantic duplicate skipped in ${logPrefix} (score=${semanticResult.score.toFixed(3)}): "${formatted.question.substring(0, 60)}..."`
        );
      }
      continue;
    }

    const acceptedQuestion = {
      ...formatted,
      embedding: semanticResult.embedding,
    };

    accepted.push(acceptedQuestion);
    comparisonPool.push({
      questionId: null,
      question: acceptedQuestion.question,
      embedding: semanticResult.embedding,
    });
  }

  return {
    accepted,
    exactDuplicates,
    semanticDuplicates,
    rejectedSamples,
    addedCount: accepted.length,
    exactDuplicateCount: exactDuplicates.length,
    semanticDuplicateCount: semanticDuplicates.length,
    duplicateCount: exactDuplicates.length + semanticDuplicates.length,
  };
}

module.exports = {
  ingestQuestions,
};

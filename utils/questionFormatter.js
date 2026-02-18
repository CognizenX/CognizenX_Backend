/**
 * Shared question formatting and deduplication helpers.
 */

function formatQuestion(raw, { category, subDomain, aiGenerated = false } = {}) {
  const correctAnswer = (raw.correct_answer || raw.correctAnswer || '').trim();

  return {
    question: (raw.question || '').trim(),
    options: Array.isArray(raw.options)
      ? raw.options.map(opt => String(opt).trim()).filter(opt => opt.length > 0)
      : [],
    correct_answer: correctAnswer,
    // Backward compatibility: support both field names
    correctAnswer: correctAnswer,
    subDomain: subDomain || raw.subDomain || '',
    ...(category ? { category } : {}),
    aiGenerated,
    createdAt: raw.createdAt || new Date(),
    difficulty: raw.difficulty || 'medium',
    validated: raw.validated !== undefined ? raw.validated : true,
  };
}

function formatQuestions(rawArray, opts = {}) {
  return rawArray
    .map(q => formatQuestion(q, opts))
    .filter(q => q.options.length >= 2 && q.question.length > 10);
}

function deduplicateAgainst(newQuestions, existingQuestions, logPrefix = '') {
  const unique = [];
  const duplicates = [];

  newQuestions.forEach(newQ => {
    const isDuplicate = existingQuestions.some(
      existing =>
        (existing.question || '').trim().toLowerCase() ===
        (newQ.question || '').trim().toLowerCase()
    );

    if (!isDuplicate) {
      unique.push(newQ);
    } else {
      duplicates.push(newQ);
      if (logPrefix) {
        console.log(
          `Duplicate question skipped in ${logPrefix}: "${(newQ.question || '').substring(0, 50)}..."`
        );
      }
    }
  });

  return {
    unique,
    duplicates,
    addedCount: unique.length,
    duplicateCount: duplicates.length,
  };
}

function normaliseForResponse(q) {
  const plain = q.toObject ? q.toObject() : { ...q };
  return {
    ...plain,
    aiGenerated: plain.aiGenerated !== undefined ? plain.aiGenerated : false,
    difficulty: plain.difficulty || 'medium',
    validated: plain.validated !== undefined ? plain.validated : true,
    correct_answer: plain.correct_answer || plain.correctAnswer || '',
    correctAnswer: plain.correct_answer || plain.correctAnswer || '',
  };
}

module.exports = {
  formatQuestion,
  formatQuestions,
  deduplicateAgainst,
  normaliseForResponse,
};

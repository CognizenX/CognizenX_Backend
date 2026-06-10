const { classifyUserQuestions, allocateQuizSlots } = require('../services/questionSelection');

describe('questionSelection', () => {
  const now = new Date('2026-06-10T12:00:00Z');

  it('classifies fresh, due review, and mastered pools', () => {
    const bank = [
      { _id: '1', question: 'Fresh?' },
      { _id: '2', question: 'Review?' },
      { _id: '3', question: 'Mastered?' },
    ];

    const statsByQuestionId = new Map([
      ['2', { lastResultCorrect: false, nextReviewAt: new Date('2026-06-09T12:00:00Z') }],
      ['3', { lastResultCorrect: true, masteredAt: new Date('2026-06-01T12:00:00Z') }],
    ]);

    const classified = classifyUserQuestions(bank, statsByQuestionId, now);
    expect(classified.fresh).toHaveLength(1);
    expect(classified.dueReview).toHaveLength(1);
    expect(classified.mastered).toHaveLength(1);
  });

  it('allocates fresh-first with review fallback and LRU mastered', () => {
    const fresh = Array.from({ length: 8 }).map((_, i) => ({ _id: `f${i}`, question: `F${i}` }));
    const dueReview = [{ question: { _id: 'r1', question: 'R1' }, stats: { lastAttemptedAt: now } }];
    const mastered = [
      { question: { _id: 'm1', question: 'M1' }, stats: { lastAttemptedAt: new Date('2026-06-01') } },
      { question: { _id: 'm2', question: 'M2' }, stats: { lastAttemptedAt: new Date('2026-06-05') } },
    ];

    const { questions } = allocateQuizSlots({ fresh, dueReview, mastered }, 10);
    expect(questions).toHaveLength(10);
    expect(questions.some((q) => String(q._id) === 'r1')).toBe(true);
    expect(questions.some((q) => String(q._id) === 'm1')).toBe(true);
  });
});

jest.mock('../services/questionSimilarity', () => {
  const actual = jest.requireActual('../services/questionSimilarity');
  return {
    ...actual,
    isSemanticallyDuplicate: jest.fn(),
    buildEmbeddingCache: jest.fn(),
  };
});

const {
  cosineSimilarity,
  normalizeQuestionText,
  isSemanticallyDuplicate,
  buildEmbeddingCache,
} = require('../services/questionSimilarity');
const { ingestQuestions } = require('../services/questionIngestion');

describe('questionSimilarity math', () => {
  it('normalizes question text', () => {
    expect(normalizeQuestionText('  Who is Buddha? ')).toBe('who is buddha');
  });

  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });
});

describe('ingestQuestions semantic filtering', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    buildEmbeddingCache.mockResolvedValue([
      {
        questionId: '1',
        question: 'Who founded Sikhism?',
        embedding: [1, 0, 0],
      },
    ]);
  });

  it('rejects semantically similar candidates', async () => {
    isSemanticallyDuplicate
      .mockResolvedValueOnce({
        duplicate: true,
        score: 0.91,
        match: { question: 'Who founded Sikhism?' },
        embedding: [1, 0, 0],
      })
      .mockResolvedValueOnce({
        duplicate: false,
        score: 0.2,
        match: null,
        embedding: [0, 1, 0],
      });

    const result = await ingestQuestions({
      category: 'religion',
      subDomain: 'Sikhism',
      candidates: [
        {
          question: 'Who established the Sikh faith?',
          options: ['Guru Nanak', 'Buddha', 'Jesus', 'Muhammad'],
          correct_answer: 'Guru Nanak',
        },
        {
          question: 'Where is the Golden Temple located?',
          options: ['Amritsar', 'Delhi', 'Mumbai', 'Chennai'],
          correct_answer: 'Amritsar',
        },
      ],
      existingQuestions: [],
    });

    expect(result.addedCount).toBe(1);
    expect(result.semanticDuplicateCount).toBe(1);
    expect(result.accepted[0].question).toContain('Golden Temple');
  });
});

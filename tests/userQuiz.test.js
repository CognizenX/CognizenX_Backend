const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const TriviaCategory = require('../models/TriviaCategory');
const UserQuestionStats = require('../models/UserQuestionStats');

describe('GET /api/user-quiz', () => {
  const sessionToken = 'user-quiz-token';

  beforeEach(async () => {
    await User.create({
      name: 'Quiz User',
      email: 'quiz@example.com',
      password: 'hashed',
      age: 30,
      gender: 'female',
      countryOfOrigin: 'IN',
      yearsOfEducation: 16,
      sessionToken,
      tokenExpiresAt: null,
    });

    const questions = Array.from({ length: 12 }).map((_, index) => ({
      question: `Personalized question ${index + 1}?`,
      options: ['A', 'B', 'C', 'D'],
      correctAnswer: 'A',
      subDomain: 'Islam',
    }));

    const trivia = await TriviaCategory.create({
      category: 'religion',
      subDomain: 'Islam',
      questions,
    });

    const user = await User.findOne({ sessionToken });
    const masteredId = trivia.questions[0]._id;
    const reviewId = trivia.questions[1]._id;

    await UserQuestionStats.create({
      userId: user._id,
      questionId: masteredId,
      category: 'religion',
      subDomain: 'Islam',
      attemptCount: 1,
      correctCount: 1,
      incorrectCount: 0,
      lastResultCorrect: true,
      masteredAt: new Date(),
      firstAttemptedAt: new Date(),
      lastAttemptedAt: new Date(),
    });

    await UserQuestionStats.create({
      userId: user._id,
      questionId: reviewId,
      category: 'religion',
      subDomain: 'Islam',
      attemptCount: 1,
      correctCount: 0,
      incorrectCount: 1,
      lastResultCorrect: false,
      nextReviewAt: new Date(Date.now() - 60_000),
      firstAttemptedAt: new Date(),
      lastAttemptedAt: new Date(),
    });
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .get('/api/user-quiz')
      .query({ categories: 'religion', subDomain: 'Islam' });

    expect(res.statusCode).toBe(401);
  });

  it('excludes mastered questions and includes due reviews', async () => {
    const res = await request(app)
      .get('/api/user-quiz')
      .set('Authorization', `Bearer ${sessionToken}`)
      .query({ categories: 'religion', subDomain: 'Islam' });

    expect(res.statusCode).toBe(200);
    expect(res.body.source).toBe('personalized');
    expect(Array.isArray(res.body.questions)).toBe(true);
    expect(res.body.questions.length).toBeGreaterThan(0);
    expect(res.body.questions.length).toBeLessThanOrEqual(10);

    const servedIds = res.body.questions.map((q) => String(q._id));
    const trivia = await TriviaCategory.findOne({ category: 'religion', subDomain: 'Islam' });
    const masteredId = String(trivia.questions[0]._id);
    const reviewId = String(trivia.questions[1]._id);

    expect(servedIds).not.toContain(masteredId);
    expect(servedIds).toContain(reviewId);
  });
});

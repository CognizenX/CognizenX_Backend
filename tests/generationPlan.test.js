const TriviaCategory = require('../models/TriviaCategory');
const TriviaAttempt = require('../models/TriviaAttempt');
const UserQuestionStats = require('../models/UserQuestionStats');
const User = require('../models/User');
const { buildGenerationPlan } = require('../services/generationPlan');

describe('buildGenerationPlan', () => {
  it('prioritizes exhausted subdomains over cold ones', async () => {
    await TriviaCategory.create({
      category: 'religion',
      subDomain: 'Islam',
      questions: Array.from({ length: 10 }).map((_, i) => ({
        question: `Islam Q${i}?`,
        options: ['A', 'B'],
        correctAnswer: 'A',
      })),
    });

    await TriviaCategory.create({
      category: 'religion',
      subDomain: 'Buddhism',
      questions: Array.from({ length: 10 }).map((_, i) => ({
        question: `Buddhism Q${i}?`,
        options: ['A', 'B'],
        correctAnswer: 'A',
      })),
    });

    const user = await User.create({
      name: 'Heavy',
      email: 'heavy@example.com',
      password: 'hashed',
      age: 40,
      gender: 'male',
      countryOfOrigin: 'IN',
      yearsOfEducation: 12,
      sessionToken: 'heavy-token',
    });

    const islamDoc = await TriviaCategory.findOne({ category: 'religion', subDomain: 'Islam' });
    const stats = islamDoc.questions.map((q) => ({
      userId: user._id,
      questionId: q._id,
      category: 'religion',
      subDomain: 'Islam',
      attemptCount: 1,
      correctCount: 1,
      incorrectCount: 0,
      lastResultCorrect: true,
      firstAttemptedAt: new Date(),
      lastAttemptedAt: new Date(),
    }));
    await UserQuestionStats.insertMany(stats);

    await TriviaAttempt.create({
      userId: user._id,
      questionId: islamDoc.questions[0]._id,
      category: 'religion',
      subDomain: 'Islam',
      selectedAnswer: 'A',
      isCorrect: true,
      timeTakenMs: 1000,
      attemptedAt: new Date(),
    });

    const previousEmptyBatch = process.env.CRON_EMPTY_BATCH;
    const previousWeeklyCap = process.env.MAX_WEEKLY_TOTAL_QUESTIONS;
    process.env.CRON_EMPTY_BATCH = '5';
    process.env.MAX_WEEKLY_TOTAL_QUESTIONS = '2000';

    const { plan, snapshots } = await buildGenerationPlan({
      now: new Date(),
      cronRunId: 'test-cron-run',
    });

    process.env.CRON_EMPTY_BATCH = previousEmptyBatch;
    process.env.MAX_WEEKLY_TOTAL_QUESTIONS = previousWeeklyCap;

    const islamSnapshot = snapshots.find((s) => s.category === 'religion' && s.subDomain === 'Islam');
    const buddhismSnapshot = snapshots.find((s) => s.category === 'religion' && s.subDomain === 'Buddhism');
    const islamPlan = plan.find((p) => p.category === 'religion' && p.subDomain === 'Islam');
    const buddhismPlan = plan.find((p) => p.category === 'religion' && p.subDomain === 'Buddhism');

    expect(islamSnapshot.tier).toBe('critical');
    expect(islamPlan).toBeDefined();
    expect(islamPlan.questionCount).toBeGreaterThan(0);
    expect(buddhismSnapshot.tier).toBe('cold');
    expect(buddhismPlan).toBeUndefined();
  });
});

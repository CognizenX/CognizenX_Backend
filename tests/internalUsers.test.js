const mongoose = require('mongoose');
const User = require('../models/User');
const TriviaAttempt = require('../models/TriviaAttempt');
const {
  describeMongoUri,
  excludeInternalUsers,
  getInternalUserIds,
} = require('../services/internalUsers');
const { computeSubDomainDemandMetrics } = require('../services/subDomainDemand');
const TriviaCategory = require('../models/TriviaCategory');

describe('internalUsers helper', () => {
  test('describeMongoUri hides credentials and detects Atlas as production-like', () => {
    const meta = describeMongoUri(
      'mongodb+srv://user:secret@cluster.example.mongodb.net/dementia_database?retryWrites=true'
    );
    expect(meta.host).toBe('cluster.example.mongodb.net');
    expect(meta.dbName).toBe('dementia_database');
    expect(meta.isLocal).toBe(false);
    expect(meta.isProductionLike).toBe(true);
    expect(JSON.stringify(meta)).not.toMatch(/secret/);
  });

  test('describeMongoUri treats localhost as local', () => {
    const meta = describeMongoUri('mongodb://localhost:27017/cognizenx');
    expect(meta.isLocal).toBe(true);
    expect(meta.isProductionLike).toBe(false);
    expect(meta.dbName).toBe('cognizenx');
  });

  test('excludeInternalUsers adds $nin for flagged users by default', async () => {
    const internal = await User.create({
      name: 'Internal',
      email: 'internal@example.com',
      password: 'hashed',
      role: 'user',
      isInternal: true,
    });
    await User.create({
      name: 'Real',
      email: 'real@example.com',
      password: 'hashed',
      role: 'user',
      isInternal: false,
    });

    const match = await excludeInternalUsers({ category: 'history' });
    expect(match.category).toBe('history');
    expect(match.userId.$nin.map(String)).toContain(String(internal._id));
    expect(match.userId.$nin).toHaveLength(1);

    const included = await excludeInternalUsers({ category: 'history' }, { includeInternal: true });
    expect(included.userId).toBeUndefined();
  });

  test('getInternalUserIds returns only flagged accounts', async () => {
    await User.create({
      name: 'Internal',
      email: 'i2@example.com',
      password: 'hashed',
      isInternal: true,
    });
    await User.create({
      name: 'Real',
      email: 'r2@example.com',
      password: 'hashed',
      isInternal: false,
    });

    const ids = await getInternalUserIds();
    expect(ids).toHaveLength(1);
  });
});

describe('subDomainDemand excludes internal users', () => {
  test('weekly attempts ignore isInternal accounts', async () => {
    const internal = await User.create({
      name: 'Internal',
      email: 'demand-internal@example.com',
      password: 'hashed',
      isInternal: true,
    });
    const real = await User.create({
      name: 'Real',
      email: 'demand-real@example.com',
      password: 'hashed',
      isInternal: false,
    });

    await TriviaCategory.create({
      category: 'history',
      subDomain: 'Modern India',
      questions: [
        {
          question: 'When did India gain independence?',
          options: ['1945', '1947', '1950', '1930'],
          correctAnswer: '1947',
        },
      ],
    });

    const questionId = new mongoose.Types.ObjectId();
    const now = new Date();

    await TriviaAttempt.create([
      {
        userId: internal._id,
        questionId,
        category: 'history',
        subDomain: 'Modern India',
        selectedAnswer: '1947',
        isCorrect: true,
        timeTakenMs: 1000,
        attemptedAt: now,
      },
      {
        userId: real._id,
        questionId,
        category: 'history',
        subDomain: 'Modern India',
        selectedAnswer: '1947',
        isCorrect: true,
        timeTakenMs: 1200,
        attemptedAt: now,
      },
    ]);

    const metrics = await computeSubDomainDemandMetrics(
      'history',
      'Modern India',
      new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    );

    expect(metrics.weeklyAttempts).toBe(1);
    expect(metrics.activeUsers7d).toBe(1);
  });
});

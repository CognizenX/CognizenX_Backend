const {
  computeHotScore,
  computeGenerationTarget,
  assignTier,
  tierToBatchSize,
  USER_EXHAUSTION_RATIO,
} = require('../services/subDomainDemand');

describe('subDomainDemand', () => {
  it('detects critical tier when a user nears bank exhaustion', () => {
    const metrics = {
      bankSize: 100,
      maxUserCoverage: 92,
      exhaustedUserCount: 1,
      weeklyAttempts: 40,
      activeUsers7d: 4,
      preferenceWeight: 10,
      avgSessionsPerUser: 10,
      hotScore: 100,
      generationTarget: 20,
    };

    const tier = assignTier(metrics, 50);
    expect(tier).toBe('critical');
    expect(tierToBatchSize(tier, metrics.generationTarget)).toBeGreaterThanOrEqual(20);
  });

  it('marks cold subdomains with no recent activity', () => {
    const metrics = {
      bankSize: 50,
      maxUserCoverage: 5,
      exhaustedUserCount: 0,
      weeklyAttempts: 0,
      activeUsers7d: 0,
      preferenceWeight: 0,
      avgSessionsPerUser: 0,
      hotScore: 0,
      generationTarget: 0,
    };

    expect(assignTier(metrics, 10)).toBe('cold');
    expect(tierToBatchSize('cold', 0)).toBe(0);
  });

  it('projects generation target from demand and remaining fresh pool', () => {
    const target = computeGenerationTarget({
      bankSize: 100,
      maxUserCoverage: 85,
      activeUsers7d: 5,
      avgSessionsPerUser: 2,
    });

    expect(target).toBeGreaterThan(0);
    expect(target).toBeLessThanOrEqual(50);
  });

  it('boosts hot score for exhausted users and activity', () => {
    const low = computeHotScore({
      weeklyAttempts: 0,
      activeUsers7d: 0,
      preferenceWeight: 0,
      exhaustedUserCount: 0,
    });
    const high = computeHotScore({
      weeklyAttempts: 50,
      activeUsers7d: 10,
      preferenceWeight: 20,
      exhaustedUserCount: 2,
    });

    expect(high).toBeGreaterThan(low);
    expect(USER_EXHAUSTION_RATIO).toBe(0.9);
  });
});

const UserActivity = require("../models/UserActivity");
const User = require("../models/User");
const {
    calculateGlobalUsageStats,
    determineGenerationTier,
    determinePercentileTier,
    getGenerationPlan,
    getDefaultPlan,

    HIGH_TIER_QUESTION_COUNT,
    MEDIUM_TIER_QUESTION_COUNT,
    LOW_TIER_QUESTION_COUNT,
    UNUSED_QUESTION_COUNT,
    BOOTSTRAP_QUESTION_COUNT
} = require("../services/usageAnalytics");

describe("Usage Analytics Service", () => {
  // ========================================
  // TEST DATA SETUP
  // ========================================
  
  let user1, user2, user3;

  beforeEach(async () => {
    // Create test users
    user1 = await User.create({
      name: "Test User 1",
      email: "user1@test.com",
      password: "password123",
      sessionToken: "token1",
    });

    user2 = await User.create({
      name: "Test User 2",
      email: "user2@test.com",
      password: "password123",
      sessionToken: "token2",
    });

    user3 = await User.create({
      name: "Test User 3",
      email: "user3@test.com",
      password: "password123",
      sessionToken: "token3",
    });
  });

  // ========================================
  // EXPLAIN: This helper creates realistic user activity data
  // We'll create categories with different popularity levels to test the tier assignment logic
  // ========================================
  
  const seedUserActivity = async () => {
    // User 1: Plays Science/Physics a LOT (high tier candidate)
    await UserActivity.create({
      userId: user1._id,
      categories: [
        { category: "Science", domain: "Physics", count: 25 },
        { category: "History", domain: "Ancient", count: 10 },
        { category: "Geography", domain: "Countries", count: 5 },
      ],
    });

    // User 2: Also plays Science/Physics + some others (confirms high popularity)
    await UserActivity.create({
      userId: user2._id,
      categories: [
        { category: "Science", domain: "Physics", count: 18 },
        { category: "History", domain: "Ancient", count: 12 },
        { category: "Sports", domain: "Cricket", count: 3 },
      ],
    });

    // User 3: Different preferences
    await UserActivity.create({
      userId: user3._id,
      categories: [
        { category: "History", domain: "Ancient", count: 8 },
        { category: "Arts", domain: "Music", count: 2 },
      ],
    });
  };

  // ========================================
  // TEST SUITE 1: calculateGlobalUsageStats()
  // Purpose: Verify that user activity is correctly aggregated
  // ========================================
  
  describe("calculateGlobalUsageStats()", () => {
    it("should return empty array when no activity exists", async () => {
      const stats = await calculateGlobalUsageStats();
      expect(stats).toEqual([]);
    });

    it("should aggregate usage across all users", async () => {
      await seedUserActivity();

      const stats = await calculateGlobalUsageStats();

      // We expect 5 unique category/domain combinations
      expect(stats.length).toBe(5);

      // Science/Physics should be #1 (25 + 18 = 43 total plays)
      const sciencePhysics = stats.find(
        (s) => s.category === "Science" && s.domain === "Physics"
      );
      expect(sciencePhysics).toBeDefined();
      expect(sciencePhysics.totalCount).toBe(43); // 25 + 18
      expect(sciencePhysics.uniqueUsers).toBe(2); // user1 + user2
    });

    it("should sort results by popularity (totalCount descending)", async () => {
      await seedUserActivity();

      const stats = await calculateGlobalUsageStats();

      // Results should be sorted: highest count first
      expect(stats[0].category).toBe("Science");
      expect(stats[0].domain).toBe("Physics");
      expect(stats[0].totalCount).toBe(43);

      // Second should be History/Ancient (25 + 12 + 8 = 30)
      expect(stats[1].category).toBe("History");
      expect(stats[1].domain).toBe("Ancient");
      expect(stats[1].totalCount).toBe(30);
    });

    it("should count unique users correctly", async () => {
      await seedUserActivity();

      const stats = await calculateGlobalUsageStats();

      const historyAncient = stats.find(
        (s) => s.category === "History" && s.domain === "Ancient"
      );

      // All 3 users played History/Ancient
      expect(historyAncient.uniqueUsers).toBe(3);
    });
  });

  // ========================================
  // TEST SUITE 2: determineGenerationTier()
  // Purpose: Verify tier assignment logic for different scenarios
  // ========================================
  
  describe("determineGenerationTier()", () => {
    
    // Bootstrap phase (weeks 1-2)
    describe("Bootstrap Phase (Week 1-2)", () => {
      it("should assign bootstrap tier with 30 questions for week 1", () => {
        const result = determineGenerationTier(5, 1, 1);
        
        expect(result.tier).toBe("bootstrap");
        expect(result.questionCount).toBe(BOOTSTRAP_QUESTION_COUNT);
      });

      it("should assign bootstrap tier even for zero usage in week 1", () => {
        const result = determineGenerationTier(0, 0, 1);
        
        expect(result.tier).toBe("bootstrap");
        expect(result.questionCount).toBe(BOOTSTRAP_QUESTION_COUNT);
      });

      it("should still use bootstrap in week 2", () => {
        const result = determineGenerationTier(10, 2, 2);
        
        expect(result.tier).toBe("bootstrap");
        expect(result.questionCount).toBe(BOOTSTRAP_QUESTION_COUNT);
      });
    });

    // Dynamic phase (week 3+) - use percentile-based or fallback logic
    describe("Dynamic Phase (Week 3+)", () => {
      it("should mark as unused if below minimum threshold", () => {
        // EXPLAIN: Less than 3 plays OR less than 1 user → unused
        const result = determineGenerationTier(2, 0, 3);
        
        expect(result.tier).toBe("unused");
        expect(result.questionCount).toBe(0);
      });

      it("should use fallback tiers when no allStats provided", () => {
        // High tier fallback: ≥3 users OR ≥20 plays
        const highTier = determineGenerationTier(25, 3, 3);
        expect(highTier.tier).toBe("high");
        expect(highTier.questionCount).toBe(HIGH_TIER_QUESTION_COUNT);

        // Medium tier fallback: ≥2 users OR ≥10 plays
        const mediumTier = determineGenerationTier(12, 2, 3);
        expect(mediumTier.tier).toBe("medium");
        expect(mediumTier.questionCount).toBe(MEDIUM_TIER_QUESTION_COUNT);

        // Low tier fallback: any other usage
        const lowTier = determineGenerationTier(5, 1, 3);
        expect(lowTier.tier).toBe("low");
        expect(lowTier.questionCount).toBe(LOW_TIER_QUESTION_COUNT);
      });

      it("should use percentile-based ranking when allStats provided", () => {
        // EXPLAIN: Create mock stats representing different popularity levels
        const mockStats = [
          { totalCount: 50, uniqueUsers: 5 }, // Top performer
          { totalCount: 30, uniqueUsers: 3 }, // Medium
          { totalCount: 20, uniqueUsers: 2 }, // Medium
          { totalCount: 10, uniqueUsers: 1 }, // Low
          { totalCount: 5, uniqueUsers: 1 },  // Low
        ];

        // Test a high-performing category (should be top 20%)
        const highResult = determineGenerationTier(50, 5, 3, mockStats);
        expect(highResult.tier).toBe("high");
        expect(highResult.questionCount).toBe(HIGH_TIER_QUESTION_COUNT);
        expect(highResult.percentile).toBeDefined();
      });
    });
  });

  // ========================================
  // TEST SUITE 3: determinePercentileTier()
  // Purpose: Test the percentile calculation algorithm specifically
  // ========================================
  
  describe("determinePercentileTier()", () => {
    it("should assign high tier to top 20% performers", () => {
      // Create 5 categories where this one is #1
      const allStats = [
        { totalCount: 100, uniqueUsers: 10 }, // This one
        { totalCount: 50, uniqueUsers: 5 },
        { totalCount: 30, uniqueUsers: 3 },
        { totalCount: 20, uniqueUsers: 2 },
        { totalCount: 10, uniqueUsers: 1 },
      ];

      const result = determinePercentileTier(100, 10, allStats);

      expect(result.tier).toBe("high");
      expect(result.questionCount).toBe(HIGH_TIER_QUESTION_COUNT);
      expect(result.percentile).toBeLessThanOrEqual(20);
    });

    it("should assign medium tier to 21-50% range", () => {
      const allStats = [
        { totalCount: 100, uniqueUsers: 10 }, // #1 - high tier
        { totalCount: 80, uniqueUsers: 8 },   // #2 - high tier
        { totalCount: 50, uniqueUsers: 5 },   // #3 - This one (position 3/6 = 50%)
        { totalCount: 30, uniqueUsers: 3 },   // #4
        { totalCount: 20, uniqueUsers: 2 },   // #5
        { totalCount: 10, uniqueUsers: 1 },   // #6
      ];

      const result = determinePercentileTier(50, 5, allStats);

      // EXPLAIN: Position 3 out of 6 = 50th percentile → medium tier
      expect(result.tier).toBe("medium");
      expect(result.questionCount).toBe(MEDIUM_TIER_QUESTION_COUNT);
      expect(result.percentile).toBeGreaterThan(20);
      expect(result.percentile).toBeLessThanOrEqual(50);
    });

    it("should use composite score (70% plays, 30% users)", () => {
      // Test that the scoring formula works correctly
      // Two categories with same play count but different user counts
      const allStats = [
        { totalCount: 50, uniqueUsers: 10 }, // Score: 50*0.7 + 10*0.3 = 38
        { totalCount: 50, uniqueUsers: 5 },  // Score: 50*0.7 + 5*0.3 = 36.5
        { totalCount: 20, uniqueUsers: 2 },
      ];

      // Higher user count should win
      const result1 = determinePercentileTier(50, 10, allStats);
      const result2 = determinePercentileTier(50, 5, allStats);

      // First one should rank higher
      expect(result1.percentile).toBeLessThan(result2.percentile);
    });

    it("should filter out categories below minimum threshold", () => {
      // Categories with <3 plays should not affect percentile calculation
      const allStats = [
        { totalCount: 50, uniqueUsers: 5 },
        { totalCount: 2, uniqueUsers: 1 },  // Below threshold, ignored
        { totalCount: 1, uniqueUsers: 1 },  // Below threshold, ignored
        { totalCount: 20, uniqueUsers: 2 },
      ];

      const result = determinePercentileTier(20, 2, allStats);

      // Should be ranked against only the 2 valid categories
      expect(result.tier).toBe("medium"); // 2nd out of 2 = 50th percentile
    });
  });

  // ========================================
  // TEST SUITE 4: getGenerationPlan()
  // Purpose: Integration test for the complete planning logic
  // ========================================
  
  describe("getGenerationPlan()", () => {
    it("should return default plan when no activity exists", async () => {
      const plan = await getGenerationPlan(1);

      // Should use categories from config/categories.js
      expect(plan.length).toBeGreaterThan(0);
      expect(plan[0]).toHaveProperty("category");
      expect(plan[0]).toHaveProperty("domain");
      expect(plan[0]).toHaveProperty("questionCount");
      expect(plan[0]).toHaveProperty("tier");
    });

    it("should create bootstrap plan for week 1", async () => {
      await seedUserActivity();

      const plan = await getGenerationPlan(1);

      // All categories should get 30 questions in week 1
      plan.forEach((item) => {
        expect(item.tier).toBe("bootstrap");
        expect(item.questionCount).toBe(BOOTSTRAP_QUESTION_COUNT);
      });
    });

    it("should create dynamic plan for week 3+", async () => {
      await seedUserActivity();

      const plan = await getGenerationPlan(3);

      // Should have mixed tiers based on popularity
      const tiers = plan.map((p) => p.tier);
      expect(tiers).toContain("high");
      expect(tiers).toContain("medium");

      // Science/Physics should be high tier (most popular)
      const sciencePhysics = plan.find(
        (p) => p.category === "Science" && p.domain === "Physics"
      );
      expect(sciencePhysics.tier).toBe("high");
      expect(sciencePhysics.questionCount).toBe(HIGH_TIER_QUESTION_COUNT);
    });

    it("should include metadata in plan items", async () => {
      await seedUserActivity();

      const plan = await getGenerationPlan(3);

      plan.forEach((item) => {
        // Each item should have complete metadata
        expect(item).toHaveProperty("category");
        expect(item).toHaveProperty("domain");
        expect(item).toHaveProperty("questionCount");
        expect(item).toHaveProperty("tier");
        expect(item).toHaveProperty("totalCount");
        expect(item).toHaveProperty("uniqueUsers");
      });
    });

    it("should calculate total questions correctly", async () => {
      await seedUserActivity();

      const plan = await getGenerationPlan(3);

      const totalQuestions = plan.reduce(
        (sum, item) => sum + item.questionCount,
        0
      );

      expect(totalQuestions).toBeGreaterThan(0);
    });

    it("should exclude unused categories from generation", async () => {
      await seedUserActivity();

      const plan = await getGenerationPlan(3);

      // Check if any unused categories have 0 questions
      const unusedCategories = plan.filter((p) => p.tier === "unused");
      unusedCategories.forEach((cat) => {
        expect(cat.questionCount).toBe(0);
      });
    });
  });

  // ========================================
  // TEST SUITE 5: getDefaultPlan()
  // Purpose: Test fallback plan when no user data exists
  // ========================================
  
  describe("getDefaultPlan()", () => {
    it("should return default categories for week 1", () => {
      const plan = getDefaultPlan(1);

      // Should return categories from config
      expect(plan.length).toBeGreaterThan(0);
      expect(plan[0]).toHaveProperty("category");
      expect(plan[0]).toHaveProperty("domain");
    });

    it("should assign bootstrap tier in week 1", () => {
      const plan = getDefaultPlan(1);

      plan.forEach((item) => {
        expect(item.tier).toBe("bootstrap");
        expect(item.questionCount).toBe(BOOTSTRAP_QUESTION_COUNT);
        expect(item.totalCount).toBe(0);
        expect(item.uniqueUsers).toBe(0);
      });
    });

    it("should assign unused tier in week 3+ for no-usage categories", () => {
      const plan = getDefaultPlan(3);

      // After bootstrap, categories with 0 usage get skipped
      plan.forEach((item) => {
        expect(item.tier).toBe("unused");
        expect(item.questionCount).toBe(UNUSED_QUESTION_COUNT);
      });
    });
  });
});

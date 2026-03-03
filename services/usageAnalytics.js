const { categories } = require('../config/categories');
const UserActivity = require('../models/UserActivity');

const isDevelopment =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV !== "production";

const HIGH_TIER_QUESTION_COUNT = isDevelopment ? 3 : 30;     // Production: 30
const MEDIUM_TIER_QUESTION_COUNT = isDevelopment ? 2 : 20;   // Production: 20
const LOW_TIER_QUESTION_COUNT = isDevelopment ? 1 : 10;      // Production: 10
const UNUSED_QUESTION_COUNT = 0;
const BOOTSTRAP_QUESTION_COUNT = isDevelopment ? 1 : 10;     // Production: 10

// Calculate global usage statistics across all users
// Aggregates which categories are most popular
const calculateGlobalUsageStats = async () => {
    try {
        const aggregation = await UserActivity.aggregate([
            // Flatten the categories array
            {
                $unwind: "$categories"
            },

            // Normalize values to avoid splitting stats by case/spacing
            {
                $addFields: {
                    normalizedCategory: {
                        $toLower: { $trim: { input: "$categories.category" } }
                    },
                    normalizedDomain: {
                        $toLower: { $trim: { input: "$categories.domain" } }
                    }
                }
            },

            // Group by normalized category + domain, but preserve original case
            {
                $group: {
                    _id: {
                        category: "$normalizedCategory",
                        domain: "$normalizedDomain"
                    },
                    originalCategory: { $first: "$categories.category" },
                    originalDomain: { $first: "$categories.domain" },
                    totalCount: { $sum: "$categories.count" },
                    uniqueUserIds: { $addToSet: "$userId" },
                    lastPlayed: { $max: "$categories.lastPlayed" }
                }
            },

            // Reshape the output for easier reading
            {
                $project: {
                    _id: 0,  // Remove the _id field
                    category: '$originalCategory',
                    domain: '$originalDomain',
                    totalCount: 1,
                    uniqueUsers: { $size: "$uniqueUserIds" },
                    lastPlayed: 1
                }
            },
            
            // Sort by popularity (most played first)
            { $sort: { totalCount: -1 } }
        ])

        console.log("Global Usage Stats:", JSON.stringify(aggregation, null, 2));
        return aggregation;
    } catch (error) {
        console.error('Error calculating global usage stats:', error);
        throw error;
    }
}

// Determine how many questions to generate for a category based on usage
// Uses PERCENTILE-BASED ranking to scale with user growth
const determineGenerationTier = (totalCount, uniqueUsers, weekNumber, allStats = []) => {
    // Bootstrap phase (first 2 weeks)
    if (weekNumber <= 2) {
        if (totalCount > 0 || uniqueUsers > 0) {
            return { tier: 'bootstrap', questionCount: BOOTSTRAP_QUESTION_COUNT };
        }
        return { tier: 'bootstrap', questionCount: BOOTSTRAP_QUESTION_COUNT };
    }

    // After week 2: Percentile-based tiering (scales automatically)
    
    // Minimum threshold: Skip categories with extremely low engagement
    const MINIMUM_PLAYS = 3;
    const MINIMUM_USERS = 1;
    
    if (totalCount < MINIMUM_PLAYS || uniqueUsers < MINIMUM_USERS) {
        return { tier: 'unused', questionCount: UNUSED_QUESTION_COUNT };
    }
    
    // If we have comparison data, use percentile-based ranking
    if (allStats && allStats.length > 1) {
        return determinePercentileTier(totalCount, uniqueUsers, allStats);
    }
    
    // Fallback to absolute thresholds if no comparison data
    if (uniqueUsers >= 3 || totalCount >= 20) {
        return { tier: 'high', questionCount: HIGH_TIER_QUESTION_COUNT };
    }
    if (uniqueUsers >= 2 || totalCount >= 10) {
        return { tier: 'medium', questionCount: MEDIUM_TIER_QUESTION_COUNT };
    }
    return { tier: 'low', questionCount: LOW_TIER_QUESTION_COUNT };
};

// Calculate percentile-based tier using relative ranking
const determinePercentileTier = (totalCount, uniqueUsers, allStats) => {
    // Create a composite score: 70% weight on plays, 30% on unique users
    const score = (totalCount * 0.7) + (uniqueUsers * 0.3);
    
    // Calculate scores for all categories
    const allScores = allStats
        .filter(stat => stat.totalCount >= 3) // Only consider categories with minimum usage
        .map(stat => (stat.totalCount * 0.7) + (stat.uniqueUsers * 0.3))
        .sort((a, b) => b - a); // Sort descending
    
    if (allScores.length === 0) {
        return { tier: 'low', questionCount: LOW_TIER_QUESTION_COUNT };
    }
    
    // Find percentile position (what % of categories have lower score?)
    const position = allScores.findIndex(s => score >= s);
    const percentile = position === -1 ? 100 : (position / allScores.length) * 100;
    
    // Tier assignment based on percentile
    if (percentile <= 20) {
        return { tier: 'high', questionCount: HIGH_TIER_QUESTION_COUNT, percentile };
    } else if (percentile <= 50) {
        return { tier: 'medium', questionCount: MEDIUM_TIER_QUESTION_COUNT, percentile };
    } else if (percentile <= 80) {
        return { tier: 'low', questionCount: LOW_TIER_QUESTION_COUNT, percentile };
    } else {
        return { tier: 'unused', questionCount: UNUSED_QUESTION_COUNT, percentile };
    }
};

// Get the complete generation plan for the week
const getGenerationPlan = async (weekNumber) => {
    try {
        console.log(`[SCHEDULER] Calculating generation plan for week ${weekNumber}...`);
        
        const usageStats = await calculateGlobalUsageStats();
        
        if (!usageStats || usageStats.length === 0) {
            console.warn('[SCHEDULER] No usage data found. Generating default plan...');
            // Return default categories if no usage data
            return getDefaultPlan(weekNumber);
        }

        const plan = usageStats.map(stat => {
            const { tier, questionCount, percentile } = determineGenerationTier(
                stat.totalCount,
                stat.uniqueUsers,
                weekNumber,
                usageStats // Pass all stats for percentile calculation
            );

            return {
                category: stat.category,
                domain: stat.domain,
                questionCount,
                tier,
                percentile: percentile !== undefined ? Math.round(percentile) : undefined,
                totalCount: stat.totalCount,
                uniqueUsers: stat.uniqueUsers,
                lastPlayed: stat.lastPlayed
            };
        });

        // Log the plan for debugging
        console.log('[SCHEDULER] Generation Plan (Percentile-Based):');
        const tierSummary = {};
        plan.forEach(item => {
            if (!tierSummary[item.tier]) {
                tierSummary[item.tier] = [];
            }
            const percentileStr = item.percentile !== undefined ? ` P${item.percentile}` : '';
            tierSummary[item.tier].push(`${item.category}/${item.domain} (${item.questionCount}q${percentileStr})`);
        });
        
        Object.entries(tierSummary).forEach(([tier, items]) => {
            console.log(`  ${tier.toUpperCase()}: ${items.join(', ')}`);
        });

        const totalQuestions = plan.reduce((sum, item) => sum + item.questionCount, 0);
        console.log(`[SCHEDULER] Total questions to generate: ${totalQuestions}`);

        return plan;
    } catch (error) {
        console.error('[SCHEDULER] Error generating plan:', error);
        throw error;
    }
};

// Get default plan when no usage data exists (initial state)
const getDefaultPlan = (weekNumber) => {
    // Convert nested categories object to flat array
    const defaultCategories = [];
    
    for (const mainCategory in categories) {
        for (const subCategory in categories[mainCategory]) {
            defaultCategories.push({
                category: mainCategory,
                domain: subCategory
            });
        }
    }
    
    return defaultCategories.map(cat => {
        const { tier, questionCount } = determineGenerationTier(0, 0, weekNumber);
        return {
            ...cat,
            questionCount,
            tier,
            totalCount: 0,
            uniqueUsers: 0
        };
    });
};

module.exports = {
    calculateGlobalUsageStats,
    determinePercentileTier,
    determineGenerationTier,
    getGenerationPlan,
    getDefaultPlan,

    HIGH_TIER_QUESTION_COUNT,
    MEDIUM_TIER_QUESTION_COUNT,
    LOW_TIER_QUESTION_COUNT,
    UNUSED_QUESTION_COUNT,
    BOOTSTRAP_QUESTION_COUNT
}

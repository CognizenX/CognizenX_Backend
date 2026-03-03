/**
 * Test usageAnalytics with REAL MongoDB data
 * Run: node test-usage-analytics.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const {
  calculateGlobalUsageStats,
  getGenerationPlan,
  determineGenerationTier,
} = require('./services/usageAnalytics');
const UserActivity = require('./models/UserActivity');
const User = require('./models/User');

async function testWithRealData() {
  try {
    console.log('========================================');
    console.log('Testing Usage Analytics with REAL DATA');
    console.log('========================================\n');

    // Connect to your real MongoDB database
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/cognizenx';
    console.log(`Connecting to: ${mongoUri}`);
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // ========================================
    // STEP 1: Show current database state
    // ========================================
    console.log('📊 STEP 1: Current Database State');
    console.log('=====================================\n');

    const userCount = await User.countDocuments();
    const activityCount = await UserActivity.countDocuments();
    
    console.log(`Total Users: ${userCount}`);
    console.log(`Users with Activity: ${activityCount}\n`);

    if (activityCount === 0) {
      console.log('⚠️  No user activity found in database!');
      console.log('   To test with data, users need to play quizzes first.');
      console.log('   Or you can seed some test data...\n');
      
      await askToSeedData();
    }

    // ========================================
    // STEP 2: Show aggregated usage statistics
    // ========================================
    console.log('\n📈 STEP 2: Aggregated Usage Statistics');
    console.log('=====================================\n');

    const stats = await calculateGlobalUsageStats();
    
    if (stats.length === 0) {
      console.log('No usage statistics available.\n');
    } else {
      console.table(
        stats.map((s, i) => ({
          Rank: i + 1,
          Category: s.category,
          Domain: s.domain,
          'Total Plays': s.totalCount,
          'Unique Users': s.uniqueUsers,
          'Last Played': s.lastPlayed ? new Date(s.lastPlayed).toLocaleDateString() : 'N/A',
        }))
      );
    }

    // ========================================
    // STEP 3: Test Week 1 Plan (Bootstrap)
    // ========================================
    console.log('\n📅 STEP 3: Week 1 Generation Plan (Bootstrap Phase)');
    console.log('====================================================\n');

    const week1Plan = await getGenerationPlan(1);
    
    console.log(`Total categories to process: ${week1Plan.length}`);
    const week1Total = week1Plan.reduce((sum, p) => sum + p.questionCount, 0);
    console.log(`Total questions to generate: ${week1Total}\n`);

    displayPlanSummary(week1Plan);

    // ========================================
    // STEP 4: Test Week 3+ Plan (Dynamic)
    // ========================================
    console.log('\n📅 STEP 4: Week 3+ Generation Plan (Dynamic/Percentile-Based)');
    console.log('=============================================================\n');

    const week3Plan = await getGenerationPlan(3);
    
    console.log(`Total categories to process: ${week3Plan.length}`);
    const week3Total = week3Plan.reduce((sum, p) => sum + p.questionCount, 0);
    console.log(`Total questions to generate: ${week3Total}\n`);

    displayPlanSummary(week3Plan);

    // ========================================
    // STEP 5: Detailed tier breakdown
    // ========================================
    console.log('\n🎯 STEP 5: Detailed Tier Breakdown (Week 3+)');
    console.log('============================================\n');

    const tierBreakdown = {
      high: week3Plan.filter(p => p.tier === 'high'),
      medium: week3Plan.filter(p => p.tier === 'medium'),
      low: week3Plan.filter(p => p.tier === 'low'),
      unused: week3Plan.filter(p => p.tier === 'unused'),
      bootstrap: week3Plan.filter(p => p.tier === 'bootstrap'),
    };

    Object.entries(tierBreakdown).forEach(([tier, items]) => {
      if (items.length > 0) {
        console.log(`\n${tier.toUpperCase()} TIER (${items.length} categories):`);
        console.log('-'.repeat(60));
        
        items.forEach(item => {
          const percentileStr = item.percentile !== undefined ? ` [P${item.percentile}]` : '';
          console.log(
            `  ${item.category}/${item.domain}`.padEnd(40) +
            `${item.questionCount}q`.padEnd(8) +
            `(${item.totalCount} plays, ${item.uniqueUsers} users)${percentileStr}`
          );
        });
      }
    });

    // ========================================
    // STEP 6: Recommendations
    // ========================================
    console.log('\n\n💡 RECOMMENDATIONS');
    console.log('==================\n');

    if (stats.length === 0) {
      console.log('• No usage data yet. All categories will get bootstrap treatment (30 questions each).');
      console.log('• After users play quizzes, the system will automatically prioritize popular categories.');
    } else {
      const highTier = tierBreakdown.high.length;
      const unused = tierBreakdown.unused.length;
      
      console.log(`• ${highTier} categories are high-priority (getting 50 questions each)`);
      console.log(`• ${unused} categories have too little usage (skipping generation)`);
      console.log('\n• The system adapts automatically as usage patterns change!');
      console.log('• Popular categories get more questions, unused ones get fewer.');
    }

    console.log('\n✅ Test completed successfully!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('Connection closed.');
  }
}

// ========================================
// Helper Functions
// ========================================

function displayPlanSummary(plan) {
  const tierCounts = {};
  const tierQuestions = {};

  plan.forEach(p => {
    tierCounts[p.tier] = (tierCounts[p.tier] || 0) + 1;
    tierQuestions[p.tier] = (tierQuestions[p.tier] || 0) + p.questionCount;
  });

  console.log('Tier Distribution:');
  Object.entries(tierCounts).forEach(([tier, count]) => {
    console.log(`  ${tier.toUpperCase()}: ${count} categories (${tierQuestions[tier]} total questions)`);
  });
}

async function askToSeedData() {
  console.log('Would you like to seed some test activity data? (y/n)');
  
  // For automated testing, we'll skip the prompt
  // In real use, you could use readline to get user input
  
  const shouldSeed = process.argv.includes('--seed');
  
  if (shouldSeed) {
    console.log('\n🌱 Seeding test data...\n');
    await seedTestData();
  } else {
    console.log('   Run with --seed flag to automatically seed test data:');
    console.log('   node test-analytics-real.js --seed\n');
  }
}

async function seedTestData() {
  try {
    // Create test users if they don't exist
    let user1 = await User.findOne({ email: 'testuser1@example.com' });
    if (!user1) {
      user1 = await User.create({
        name: 'Test User 1',
        email: 'testuser1@example.com',
        password: 'hashed_password_here',
        sessionToken: 'test-token-1',
      });
    }

    let user2 = await User.findOne({ email: 'testuser2@example.com' });
    if (!user2) {
      user2 = await User.create({
        name: 'Test User 2',
        email: 'testuser2@example.com',
        password: 'hashed_password_here',
        sessionToken: 'test-token-2',
      });
    }

    // Seed activity data
    await UserActivity.findOneAndUpdate(
      { userId: user1._id },
      {
        userId: user1._id,
        categories: [
          { category: 'entertainment', domain: 'bollywood', count: 25 },
          { category: 'history', domain: 'ancientIndia', count: 15 },
          { category: 'geography', domain: 'statesAndCapitals', count: 8 },
        ],
      },
      { upsert: true, new: true }
    );

    await UserActivity.findOneAndUpdate(
      { userId: user2._id },
      {
        userId: user2._id,
        categories: [
          { category: 'entertainment', domain: 'bollywood', count: 20 },
          { category: 'politics', domain: 'national', count: 12 },
          { category: 'generalKnowledge', domain: 'economy', count: 5 },
        ],
      },
      { upsert: true, new: true }
    );

    console.log('✅ Test data seeded successfully!');
    console.log('   - 2 test users created');
    console.log('   - Activity data added for multiple categories\n');
  } catch (error) {
    console.error('❌ Error seeding data:', error.message);
  }
}

// ========================================
// Run the test
// ========================================

testWithRealData()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

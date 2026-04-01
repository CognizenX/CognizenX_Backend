/**
 * Test Question Scheduler Service
 * 
 * WHAT THIS DOES:
 * 1. Connects to MongoDB
 * 2. Gets the generation plan from usageAnalytics
 * 3. Runs the scheduler with that plan
 * 4. Shows results
 * 
 * HOW TO RUN:
 * node test-scheduler.js --dry-run     (shows plan, doesn't generate)
 * node test-scheduler.js --dry-run --list  (show all categories with tiers)
 * node test-scheduler.js --confirm --high=2 --medium=1 --low=1  (2 high, 1 medium, 1 low)
 * node test-scheduler.js --confirm --tier=high --limit=3  (only HIGH tier, max 3)
 * node test-scheduler.js --confirm --week=3 --high=2 --medium=2  (week 3 with specific counts)
 * 
 * WARNING: This will call OpenAI API multiple times = costs money!
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { getGenerationPlan } = require('./services/usageAnalytics');
const { runWeeklyGeneration, getSchedulerMetadata } = require('./services/questionScheduler');

function getWeekOverrideArg() {
  const weekArg = process.argv.find(arg => arg.startsWith('--week='));
  if (!weekArg) return null;

  const value = Number(weekArg.split('=')[1]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('Invalid --week value. Use a positive integer like --week=3');
  }

  return value;
}

function getLimitArg() {
  const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
  if (!limitArg) return null;

  const value = Number(limitArg.split('=')[1]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('Invalid --limit value. Use a positive integer like --limit=5');
  }

  return value;
}

function getTierArg() {
  const tierArg = process.argv.find(arg => arg.startsWith('--tier='));
  if (!tierArg) return null;

  const value = tierArg.split('=')[1]?.toLowerCase();
  const validTiers = ['high', 'medium', 'low', 'unused', 'bootstrap'];

  if (!validTiers.includes(value)) {
    throw new Error(
      `Invalid --tier value. Use one of: ${validTiers.join(', ')}`
    );
  }

  return value;
}

function getPerTierArgs() {
  const perTierCounts = {};
  const validTiers = ['high', 'medium', 'low', 'unused', 'bootstrap'];

  validTiers.forEach(tier => {
    const arg = process.argv.find(a => a.startsWith(`--${tier}=`));
    if (arg) {
      const value = Number(arg.split('=')[1]);
      if (!Number.isInteger(value) || value < 0) {
        throw new Error(`Invalid --${tier} value. Use a non-negative integer`);
      }
      perTierCounts[tier] = value;
    }
  });

  return Object.keys(perTierCounts).length > 0 ? perTierCounts : null;
}

async function testScheduler() {
  try {
    console.log('========================================');
    console.log('Test Step 2: Question Scheduler');
    console.log('========================================\n');

    // Connect to database
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/test';
    
    console.log(`Connecting to: ${mongoUri.replace(/:\/\/[^@]+@/, '://***@')}`);

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // STEP 1: Get current metadata
    console.log('STEP 1: Checking scheduler metadata');
    console.log('=====================================\n');

    const metadata = await getSchedulerMetadata();
    const isDryRun = process.argv.includes('--dry-run');
    const showList = process.argv.includes('--list');
    const weekOverride = getWeekOverrideArg();
    const planLimit = getLimitArg();
    const tierFilter = getTierArg();
    const perTierCounts = getPerTierArgs();

    const actualNextWeek = metadata.weekNumber + 1;
    const weekNumber = weekOverride ?? actualNextWeek;

    console.log(`Current week number: ${metadata.weekNumber}`);
    console.log(`Next run from metadata: Week ${actualNextWeek}`);
    if (weekOverride !== null) {
      console.log(`Simulated week override: Week ${weekOverride}`);
    }
    console.log(`Using week for this run: Week ${weekNumber}`);
    console.log(`Phase: ${weekNumber <= 2 ? 'BOOTSTRAP (30q per category)' : 'DYNAMIC (tier-based)'}`);
    console.log(`Total questions generated so far: ${metadata.totalQuestionsGenerated}\n`);

    // STEP 2: Get generation plan
    console.log('STEP 2: Getting generation plan from analytics');
    console.log('===============================================\n');

    const plan = await getGenerationPlan(weekNumber);

    console.log(`Total categories in plan: ${plan.length}`);

    // Show full list if requested
    if (showList) {
      console.log('\n📋 ALL CATEGORIES BY TIER:');
      console.log('─'.repeat(70));
      const byTier = {};
      plan.forEach(p => {
        if (!byTier[p.tier]) byTier[p.tier] = [];
        byTier[p.tier].push(p);
      });

      Object.entries(byTier).forEach(([tier, categories]) => {
        console.log(`\n${tier.toUpperCase()} (${categories.length} categories):`);
        categories.forEach((p, idx) => {
          console.log(
            `  ${idx + 1}. ${p.category}/${p.domain}`.padEnd(45) +
            `${p.questionCount}q`
          );
        });
      });
      console.log('\n' + '='.repeat(70));
      console.log('Use: --high=N --medium=N --low=N --unused=N to select specific counts\n');
      await mongoose.connection.close();
      console.log('\n✅ Category list displayed\n');
      return;
    }

    // Apply per-tier counts if specified
    let displayPlan = plan;
    if (perTierCounts !== null) {
      const byTier = {};
      plan.forEach(p => {
        if (!byTier[p.tier]) byTier[p.tier] = [];
        byTier[p.tier].push(p);
      });

      displayPlan = [];
      Object.entries(perTierCounts).forEach(([tier, count]) => {
        if (byTier[tier]) {
          displayPlan.push(...byTier[tier].slice(0, count));
        }
      });

      console.log(`⚠️  PER-TIER SELECTION: ${Object.entries(perTierCounts)
        .map(([t, c]) => `${c} ${t}`)
        .join(', ')} (Total: ${displayPlan.length} categories)`);
    } else if (tierFilter !== null) {
      // Apply tier filter if specified
      displayPlan = plan.filter(p => p.tier === tierFilter);
      console.log(`⚠️  TIER FILTER: Using only ${tierFilter.toUpperCase()} tier categories (${displayPlan.length} of ${plan.length})`);
    } else if (planLimit !== null) {
      // Apply limit with balanced distribution (skip bootstrap)
      const byTier = {};
      plan.forEach(p => {
        if (p.tier === 'bootstrap') return; // Skip bootstrap
        if (!byTier[p.tier]) byTier[p.tier] = [];
        byTier[p.tier].push(p);
      });

      const tiers = Object.keys(byTier);
      const distributed = [];
      const perTier = Math.ceil(planLimit / tiers.length);

      // Take items round-robin from each tier
      for (let i = 0; i < perTier && distributed.length < planLimit; i++) {
        for (const tier of tiers) {
          if (i < byTier[tier].length && distributed.length < planLimit) {
            distributed.push(byTier[tier][i]);
          }
        }
      }

      displayPlan = distributed;
      console.log(`⚠️  LIMIT WITH BALANCE: Using ${planLimit} categories distributed across tiers`);
      console.log(`     (1 from each tier when possible, excluding bootstrap)`);
    }

    // Show tier summary
    const tierSummary = {};
    displayPlan.forEach(p => {
      if (!tierSummary[p.tier]) {
        tierSummary[p.tier] = { count: 0, questions: 0 };
      }
      tierSummary[p.tier].count++;
      tierSummary[p.tier].questions += p.questionCount;
    });

    console.log('\nTier Distribution:');
    Object.entries(tierSummary).forEach(([tier, data]) => {
      console.log(
        `  ${tier.toUpperCase().padEnd(10)}: ${data.count} categories, ${data.questions} total questions`
      );
    });

    const totalPlanned = displayPlan.reduce((sum, p) => sum + p.questionCount, 0);
    console.log(`\n  TOTAL: ${totalPlanned} questions to generate`);

    // Show sample categories
    console.log('\nSample categories (first 5):');
    displayPlan.slice(0, 5).forEach((p, i) => {
      console.log(
        `  ${i + 1}. ${p.category}/${p.domain}`.padEnd(40) +
        `${p.questionCount}q`.padEnd(8) +
        `(${p.tier})`
      );
    });

    // STEP 3: Show dry-run or execute
    console.log('\n' + '='.repeat(70));

    if (isDryRun) {
      console.log('DRY RUN MODE - No generation will occur');
      if (weekOverride !== null) {
        console.log(`Week simulation active: Week ${weekOverride}`);
      }
      console.log('To actually generate questions, run: node test-scheduler.js');
      console.log('(This will call OpenAI API and cost money!)');
    } else {
      // Check for user confirmation if this is not a dry run
      const shouldContinue = process.argv.includes('--confirm');

      if (!shouldContinue && displayPlan.length > 5) {
        console.log('⚠️  Large plan detected! This will:');
        console.log(`  • Call OpenAI API ${displayPlan.filter(p => p.questionCount > 0).length} times`);
        console.log(`  • Generate ${totalPlanned} questions`);
        console.log(`  • Take several minutes`);
        console.log(`  • Cost API credits`);
        console.log('\nTo proceed, run: node test-scheduler.js --confirm');
        await mongoose.connection.close();
        return;
      }

      // EXECUTE THE SCHEDULER
      console.log('STEP 3: Running question scheduler');
      console.log('==================================\n');

      const results = await runWeeklyGeneration(displayPlan);

      // STEP 4: Show results
      console.log('\nSTEP 4: Results Summary');
      console.log('=======================\n');

      console.log(`Status: ${results.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      console.log(`Week: ${results.weekNumber}`);
      console.log(`Questions generated: ${results.totalQuestionsGenerated}`);
      console.log(`Categories processed: ${results.categoriesProcessed}`);
      console.log(`Categories with questions: ${results.categoriesWithQuestions}`);

      // Show any failures
      const failures = results.results.filter(r => !r.success);
      if (failures.length > 0) {
        console.log(`\n⚠️  ${failures.length} categories had errors:`);
        failures.forEach(f => {
          console.log(`  • ${f.category}/${f.domain}: ${f.error}`);
        });
      }

      // Show by-tier summary
      const byStat = {};
      results.results.forEach(r => {
        if (!byStat[r.tier]) {
          byStat[r.tier] = { success: 0, failed: 0, questions: 0 };
        }
        if (r.success) {
          byStat[r.tier].success++;
          byStat[r.tier].questions += r.questionsGenerated;
        } else {
          byStat[r.tier].failed++;
        }
      });

      console.log('\nResults by Tier:');
      Object.entries(byStat).forEach(([tier, stats]) => {
        console.log(
          `  ${tier.toUpperCase().padEnd(10)}: ${stats.success} ok, ${stats.failed} failed, ${stats.questions} questions added`
        );
      });

      // STEP 5: Display all generated questions
      if (results.totalQuestionsGenerated > 0) {
        console.log('\n' + '='.repeat(70));
        console.log('STEP 5: All Generated Questions');
        console.log('==============================\n');

        // Loop through successful results that have questions
        for (const result of results.results) {
          if (!result.success || !result.questions || result.questions.length === 0) {
            continue;
          }

          const { category, domain, questions } = result;

          console.log(`\n📚 ${category}/${domain} (${questions.length} questions)`);
          console.log('─'.repeat(70));

          // Display each question
          questions.forEach((q, idx) => {
            console.log(`\n${idx + 1}. ${q.question}`);
            if (q.options && q.options.length > 0) {
              q.options.forEach((opt, optIdx) => {
                const isCorrect = opt === q.correct_answer ? ' ✓' : '';
                console.log(`   ${String.fromCharCode(65 + optIdx)}) ${opt}${isCorrect}`);
              });
            }
            if (q.difficulty) {
              console.log(`   [Difficulty: ${q.difficulty}]`);
            }
            if (q.subDomain) {
              console.log(`   [SubDomain: ${q.subDomain}]`);
            }
          });
        }
      }
    }

    console.log('\n✅ Test completed!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('Connection closed.');
  }
}

testScheduler()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

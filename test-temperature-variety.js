const axios = require('axios');

const BASE_URL = process.env.TEST_URL || 'http://localhost:6000';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testCategory(category, subDomain, testName, runNumber) {
  try {
    log(`\n${'='.repeat(80)}`, 'cyan');
    log(`${testName} - Run ${runNumber}`, 'bright');
    log(`${'='.repeat(80)}`, 'cyan');
    
    const url = `${BASE_URL}/api/random-questions?categories=${category}${subDomain ? `&subDomain=${subDomain}` : ''}&useSaved=false`;
    log(`Testing: ${url}`, 'yellow');
    
    const startTime = Date.now();
    const response = await axios.get(url);
    const endTime = Date.now();
    
    if (response.data && response.data.questions) {
      const questions = response.data.questions;
      log(`\n✅ Success! Received ${questions.length} questions (${endTime - startTime}ms)`, 'green');
      
      // Display all questions
      questions.forEach((q, index) => {
        log(`\n${index + 1}. ${q.question}`, 'bright');
        log(`   Options: ${q.options.join(', ')}`, 'blue');
        log(`   Correct: ${q.correct_answer}`, 'green');
        if (q.aiGenerated) {
          log(`   [AI Generated]`, 'magenta');
        }
      });
      
      return questions;
    } else {
      log(`❌ Unexpected response format:`, 'red');
      console.log(response.data);
      return [];
    }
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    if (error.response) {
      log(`Status: ${error.response.status}`, 'red');
      log(`Data: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    }
    return [];
  }
}

function analyzeVariety(allRuns) {
  log(`\n${'='.repeat(80)}`, 'cyan');
  log('VARIETY ANALYSIS', 'bright');
  log(`${'='.repeat(80)}`, 'cyan');
  
  // Collect all questions from all runs
  const allQuestions = [];
  allRuns.forEach((run, runIndex) => {
    run.forEach((q, qIndex) => {
      allQuestions.push({
        run: runIndex + 1,
        question: q.question.trim().toLowerCase(),
        original: q.question
      });
    });
  });
  
  // Find duplicates
  const questionMap = new Map();
  allQuestions.forEach((q) => {
    const key = q.question;
    if (!questionMap.has(key)) {
      questionMap.set(key, []);
    }
    questionMap.get(key).push(q);
  });
  
  const duplicates = Array.from(questionMap.entries())
    .filter(([_, occurrences]) => occurrences.length > 1)
    .map(([question, occurrences]) => ({
      question,
      count: occurrences.length,
      runs: occurrences.map(o => o.run)
    }));
  
  if (duplicates.length > 0) {
    log(`\n⚠️  Found ${duplicates.length} duplicate question(s):`, 'yellow');
    duplicates.forEach((dup, index) => {
      log(`\n${index + 1}. "${dup.question.substring(0, 80)}..."`, 'yellow');
      log(`   Appeared ${dup.count} times in runs: ${dup.runs.join(', ')}`, 'yellow');
    });
  } else {
    log(`\n✅ No duplicate questions found! All questions are unique.`, 'green');
  }
  
  // Calculate uniqueness percentage
  const totalQuestions = allQuestions.length;
  const uniqueQuestions = questionMap.size;
  const uniquenessPercentage = ((uniqueQuestions / totalQuestions) * 100).toFixed(2);
  
  log(`\n📊 Statistics:`, 'cyan');
  log(`   Total questions generated: ${totalQuestions}`, 'blue');
  log(`   Unique questions: ${uniqueQuestions}`, 'blue');
  log(`   Uniqueness: ${uniquenessPercentage}%`, uniquenessPercentage >= 90 ? 'green' : uniquenessPercentage >= 70 ? 'yellow' : 'red');
  
  return {
    totalQuestions,
    uniqueQuestions,
    uniquenessPercentage: parseFloat(uniquenessPercentage),
    duplicates: duplicates.length
  };
}

async function runTests() {
  log('\n🚀 Starting Temperature Variety Tests', 'bright');
  log(`Base URL: ${BASE_URL}`, 'cyan');
  
  // Wait a bit to ensure server is ready
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const results = {};
  
  // Test Cricket 3 times
  log(`\n${'#'.repeat(80)}`, 'magenta');
  log('TESTING CRICKET (3 runs)', 'bright');
  log(`${'#'.repeat(80)}`, 'magenta');
  const cricketRuns = [];
  for (let i = 1; i <= 3; i++) {
    const questions = await testCategory('entertainment', 'cricket', 'Cricket', i);
    cricketRuns.push(questions);
    // Wait between runs to avoid rate limiting
    if (i < 3) {
      log(`\n⏳ Waiting 3 seconds before next run...`, 'yellow');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  results.cricket = analyzeVariety(cricketRuns);
  
  // Wait before next category
  log(`\n⏳ Waiting 5 seconds before testing next category...`, 'yellow');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Test Politics 3 times
  log(`\n${'#'.repeat(80)}`, 'magenta');
  log('TESTING POLITICS (3 runs)', 'bright');
  log(`${'#'.repeat(80)}`, 'magenta');
  const politicsRuns = [];
  for (let i = 1; i <= 3; i++) {
    const questions = await testCategory('politics', null, 'Politics', i);
    politicsRuns.push(questions);
    if (i < 3) {
      log(`\n⏳ Waiting 3 seconds before next run...`, 'yellow');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  results.politics = analyzeVariety(politicsRuns);
  
  // Wait before next category
  log(`\n⏳ Waiting 5 seconds before testing next category...`, 'yellow');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Test National 3 times
  log(`\n${'#'.repeat(80)}`, 'magenta');
  log('TESTING NATIONAL (3 runs)', 'bright');
  log(`${'#'.repeat(80)}`, 'magenta');
  const nationalRuns = [];
  for (let i = 1; i <= 3; i++) {
    const questions = await testCategory('politics', 'national', 'National', i);
    nationalRuns.push(questions);
    if (i < 3) {
      log(`\n⏳ Waiting 3 seconds before next run...`, 'yellow');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  results.national = analyzeVariety(nationalRuns);
  
  // Final Summary
  log(`\n${'='.repeat(80)}`, 'cyan');
  log('FINAL SUMMARY', 'bright');
  log(`${'='.repeat(80)}`, 'cyan');
  
  Object.entries(results).forEach(([category, stats]) => {
    log(`\n${category.toUpperCase()}:`, 'bright');
    log(`   Uniqueness: ${stats.uniquenessPercentage}%`, 
        stats.uniquenessPercentage >= 90 ? 'green' : stats.uniquenessPercentage >= 70 ? 'yellow' : 'red');
    log(`   Duplicates: ${stats.duplicates}`, stats.duplicates === 0 ? 'green' : 'yellow');
    log(`   Total: ${stats.totalQuestions} questions, ${stats.uniqueQuestions} unique`, 'blue');
  });
  
  log(`\n✅ All tests completed!`, 'green');
}

// Run the tests
runTests().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});


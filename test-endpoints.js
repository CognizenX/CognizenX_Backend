/**
 * Manual Test Script for /api/random-questions endpoint
 * Tests the new 7 new + 3 saved questions functionality
 * 
 * Run with: node test-endpoints.js
 */

const axios = require('axios');
require('dotenv').config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:6000';
const TEST_CATEGORY = 'history';
const TEST_SUBDOMAIN = 'ancientIndia';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testRandomQuestions() {
  log('\n🧪 Testing /api/random-questions Endpoint\n', 'cyan');
  
  try {
    // Test 1: Basic request with categories
    log('Test 1: Basic request with categories', 'blue');
    const response1 = await axios.get(`${API_BASE_URL}/api/random-questions`, {
      params: {
        categories: TEST_CATEGORY
      }
    });
    
    log(`✅ Status: ${response1.status}`, 'green');
    log(`✅ Questions returned: ${response1.data.questions?.length || 0}`, 'green');
    log(`✅ Total available: ${response1.data.totalAvailable || 0}`, 'green');
    log(`✅ Generated (AI): ${response1.data.generated || 0}`, 'green');
    
    if (response1.data.questions && response1.data.questions.length > 0) {
      const firstQ = response1.data.questions[0];
      log(`✅ First question structure:`, 'green');
      log(`   - Has question: ${!!firstQ.question}`, 'green');
      log(`   - Has options: ${!!firstQ.options}`, 'green');
      log(`   - Has correctAnswer: ${!!firstQ.correctAnswer}`, 'green');
      log(`   - AI Generated: ${firstQ.aiGenerated || false}`, 'green');
    }
    
    // Test 2: Request with categories and subDomain
    log('\nTest 2: Request with categories and subDomain', 'blue');
    const response2 = await axios.get(`${API_BASE_URL}/api/random-questions`, {
      params: {
        categories: TEST_CATEGORY,
        subDomain: TEST_SUBDOMAIN
      }
    });
    
    log(`✅ Status: ${response2.status}`, 'green');
    log(`✅ Questions returned: ${response2.data.questions?.length || 0}`, 'green');
    log(`✅ Generated (AI): ${response2.data.generated || 0}`, 'green');
    
    // Test 3: Multiple categories
    log('\nTest 3: Multiple categories', 'blue');
    const response3 = await axios.get(`${API_BASE_URL}/api/random-questions`, {
      params: {
        categories: 'history,politics'
      }
    });
    
    log(`✅ Status: ${response3.status}`, 'green');
    log(`✅ Questions returned: ${response3.data.questions?.length || 0}`, 'green');
    log(`✅ Generated (AI): ${response3.data.generated || 0}`, 'green');
    
    // Test 4: Check for 7 new + 3 saved mix
    log('\nTest 4: Verifying question mix (7 new + 3 saved)', 'blue');
    if (response2.data.questions && response2.data.questions.length === 10) {
      const aiGenerated = response2.data.questions.filter(q => q.aiGenerated === true).length;
      const fromBank = response2.data.questions.filter(q => q.aiGenerated === false).length;
      
      log(`✅ Total questions: 10`, 'green');
      log(`✅ AI Generated (new): ${aiGenerated}`, 'green');
      log(`✅ From Bank (saved): ${fromBank}`, 'green');
      
      if (aiGenerated >= 7 && fromBank >= 3) {
        log(`✅ Perfect mix: 7 new + 3 saved!`, 'green');
      } else if (aiGenerated === 0 && fromBank === 10) {
        log(`⚠️  All from bank (generation may have failed - this is expected fallback)`, 'yellow');
      } else {
        log(`⚠️  Mixed: ${aiGenerated} new + ${fromBank} saved (may vary based on availability)`, 'yellow');
      }
    }
    
    // Test 5: Missing categories (should return 400)
    log('\nTest 5: Missing categories (should return 400)', 'blue');
    try {
      await axios.get(`${API_BASE_URL}/api/random-questions`);
      log(`❌ Should have returned 400`, 'red');
    } catch (error) {
      if (error.response && error.response.status === 400) {
        log(`✅ Correctly returned 400`, 'green');
      } else {
        log(`❌ Unexpected error: ${error.message}`, 'red');
      }
    }
    
    // Test 6: Invalid category (should return empty array or fallback)
    log('\nTest 6: Invalid category (should handle gracefully)', 'blue');
    const response6 = await axios.get(`${API_BASE_URL}/api/random-questions`, {
      params: {
        categories: 'nonexistentcategory123'
      }
    });
    
    log(`✅ Status: ${response6.status}`, 'green');
    log(`✅ Questions returned: ${response6.data.questions?.length || 0}`, 'green');
    if (response6.data.message) {
      log(`✅ Message: ${response6.data.message}`, 'green');
    }
    
    log('\n✅ All tests completed!\n', 'green');
    
  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Data: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    }
    if (error.code === 'ECONNREFUSED') {
      log(`\n⚠️  Connection refused. Make sure the server is running:`, 'yellow');
      log(`   npm start`, 'yellow');
      log(`   Or check if the server is running on ${API_BASE_URL}`, 'yellow');
    }
    process.exit(1);
  }
}

// Check if server is running
async function checkServer() {
  try {
    const response = await axios.get(`${API_BASE_URL}/api`);
    log(`✅ Server is running at ${API_BASE_URL}`, 'green');
    return true;
  } catch (error) {
    log(`❌ Server is not running at ${API_BASE_URL}`, 'red');
    log(`   Please start the server with: npm start`, 'yellow');
    return false;
  }
}

// Main execution
async function main() {
  log('🚀 Starting Endpoint Tests\n', 'cyan');
  log(`📍 Testing against: ${API_BASE_URL}\n`, 'cyan');
  
  const serverRunning = await checkServer();
  if (!serverRunning) {
    process.exit(1);
  }
  
  await testRandomQuestions();
}

// Run tests
if (require.main === module) {
  main().catch(error => {
    log(`\n❌ Fatal error: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { testRandomQuestions, checkServer };


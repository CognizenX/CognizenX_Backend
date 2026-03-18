/**
 * Test the Protected Cron Endpoint
 * 
 * This script demonstrates how to manually trigger the weekly question generation
 * endpoint that Vercel Cron will call automatically.
 * 
 * SETUP:
 * 1. Make sure your server is running: node index.js
 * 2. Set CRON_SECRET in your .env file
 * 3. Make sure OPENAI_API_KEY is configured
 * 4. Make sure MongoDB is connected
 * 
 * HOW TO RUN:
 * node test-cron-endpoint.js
 * 
 * WHAT IT DOES:
 * - Calls POST /api/internal/generate-weekly-questions
 * - Uses Bearer token authentication
 * - Triggers the weekly question generation
 * - Shows the results
 */

require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:6000';
const CRON_SECRET = process.env.CRON_SECRET;

async function testCronEndpoint() {
  console.log('========================================');
  console.log('Test: Protected Cron Endpoint');
  console.log('========================================\n');

  // Check if CRON_SECRET is configured
  if (!CRON_SECRET) {
    console.error('❌ CRON_SECRET not configured!');
    console.log('\nTo fix:');
    console.log('1. Generate a secure token:');
    console.log('   node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    console.log('2. Add to your .env file:');
    console.log('   CRON_SECRET=<your-generated-token>');
    process.exit(1);
  }

  console.log(`🔗 API URL: ${BASE_URL}/api/internal/generate-weekly-questions`);

  try {
    console.log('Test 1: Call endpoint WITH valid token');
    console.log('─'.repeat(70));

    const startTime = Date.now();

    const response = await axios.post(
      `${BASE_URL}/api/internal/generate-weekly-questions`,
      {}, // Empty body
      {
        headers: {
          'Authorization': `Bearer ${CRON_SECRET}`,
          'Content-Type': 'application/json'
        },
        timeout: 300000 // 5 minute timeout (generation can take a while)
      }
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n✅ SUCCESS (${duration}s)\n`);
    console.log('Response:');
    console.log(JSON.stringify(response.data, null, 2));

    if (response.data.success) {
      console.log(`\n📊 Summary:`);
      console.log(`  Week Number: ${response.data.weekNumber}`);
      console.log(`  Questions Generated: ${response.data.totalQuestionsGenerated}`);
      console.log(`  Categories Processed: ${response.data.categoriesProcessed}`);
      console.log(`  Categories with Questions: ${response.data.categoriesWithQuestions}`);
      console.log(`  Failures: ${response.data.failures}`);
    }

  } catch (error) {
    if (error.response) {
      console.log(`\n❌ HTTP ${error.response.status}: ${error.response.statusText}`);
      console.log('\nResponse:');
      console.log(JSON.stringify(error.response.data, null, 2));
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n❌ Connection refused - is the server running?');
      console.log(`   Make sure to start the server: node index.js`);
    } else if (error.code === 'ETIMEDOUT') {
      console.log('\n❌ Request timed out');
      console.log('   Generation might take longer than expected.');
      console.log('   Check server logs for progress.');
    } else {
      console.log('\n❌ Error:', error.message);
    }
    process.exit(1);
  }

  // Test 2: Try without token (should fail with 401)
  console.log('\n\nTest 2: Call endpoint WITHOUT token (should fail)');
  console.log('─'.repeat(70));

  try {
    await axios.post(
      `${BASE_URL}/api/internal/generate-weekly-questions`,
      {},
      {
        headers: {
          'Content-Type': 'application/json'
          // No Authorization header
        }
      }
    );

    console.log('❌ UNEXPECTED: Should have returned 401');

  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('✅ Correctly rejected unauthorized request');
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Message: ${error.response.data.error}`);
    } else {
      console.log('❌ Unexpected error:', error.message);
    }
  }

  // Test 3: Try with wrong token (should fail with 401)
  console.log('\n\nTest 3: Call endpoint WITH INVALID token (should fail)');
  console.log('─'.repeat(70));

  try {
    await axios.post(
      `${BASE_URL}/api/internal/generate-weekly-questions`,
      {},
      {
        headers: {
          'Authorization': 'Bearer wrong-token-12345',
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('❌ UNEXPECTED: Should have returned 401');

  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('✅ Correctly rejected invalid token');
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Message: ${error.response.data.error}`);
    } else {
      console.log('❌ Unexpected error:', error.message);
    }
  }

  console.log('\n========================================');
  console.log('✅ All tests completed!');
  console.log('========================================\n');
}

// Run the test
testCronEndpoint()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

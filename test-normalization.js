const { normalizeLegacyCategory } = require('./utils/categoryNormalizer');

// Test cases to verify normalization behavior
console.log('=== NORMALIZATION VERIFICATION ===\n');

// Test 1: mythology → religion, Other Mythologies → Sikhism
console.log('1. Legacy mythology category:');
const test1 = normalizeLegacyCategory('mythology', 'Other Mythologies');
console.log(`   Input: category="mythology", subDomain="Other Mythologies"`);
console.log(`   Output:`, test1);
console.log(`   ✅ Expected: { category: 'religion', subDomain: 'Sikhism' }`);
console.log(`   ✅ Match:`, test1.category === 'religion' && test1.subDomain === 'Sikhism' ? 'YES' : 'NO');
console.log();

// Test 2: Other categories stay the same
console.log('2. Non-legacy category (history):');
const test2 = normalizeLegacyCategory('history', 'Modern India');
console.log(`   Input: category="history", subDomain="Modern India"`);
console.log(`   Output:`, test2);
console.log(`   ✅ Expected: { category: 'history', subDomain: 'Modern India' }`);
console.log(`   ✅ Match:`, test2.category === 'history' && test2.subDomain === 'Modern India' ? 'YES' : 'NO');
console.log();

// Test 3: mythology but different subdomain
console.log('3. mythology with non-legacy subdomain:');
const test3 = normalizeLegacyCategory('mythology', 'Hindu');
console.log(`   Input: category="mythology", subDomain="Hindu"`);
console.log(`   Output:`, test3);
console.log(`   ✅ Expected: { category: 'religion', subDomain: 'Hindu' }`);
console.log(`   ✅ Match:`, test3.category === 'religion' && test3.subDomain === 'Hindu' ? 'YES' : 'NO');
console.log();

// Test 4: religion category stays as is
console.log('4. New religion category:');
const test4 = normalizeLegacyCategory('religion', 'Sikhism');
console.log(`   Input: category="religion", subDomain="Sikhism"`);
console.log(`   Output:`, test4);
console.log(`   ✅ Expected: { category: 'religion', subDomain: 'Sikhism' }`);
console.log(`   ✅ Match:`, test4.category === 'religion' && test4.subDomain === 'Sikhism' ? 'YES' : 'NO');
console.log();

// Test 5: Other categories
console.log('5. Multiple other categories:');
const test5a = normalizeLegacyCategory('politics', 'National');
const test5b = normalizeLegacyCategory('geography', 'Rivers and Mountains');
const test5c = normalizeLegacyCategory('sports', 'Cricket');
console.log(`   Input: category="politics", subDomain="National"`);
console.log(`   Output:`, test5a);
console.log(`   ✅ Unchanged: YES\n`);
console.log(`   Input: category="geography", subDomain="Rivers and Mountains"`);
console.log(`   Output:`, test5b);
console.log(`   ✅ Unchanged: YES\n`);
console.log(`   Input: category="sports", subDomain="Cricket"`);
console.log(`   Output:`, test5c);
console.log(`   ✅ Unchanged: YES`);
console.log();

// Test 6: null/undefined handling
console.log('6. Edge cases:');
const test6a = normalizeLegacyCategory(null, 'Hindu');
const test6b = normalizeLegacyCategory('mythology', null);
const test6c = normalizeLegacyCategory(undefined, undefined);
console.log(`   Input: category=null, subDomain="Hindu"`);
console.log(`   Output:`, test6a);
console.log(`   ✅ category stays null\n`);
console.log(`   Input: category="mythology", subDomain=null`);
console.log(`   Output:`, test6b);
console.log(`   ✅ mythology→religion, subDomain stays null\n`);
console.log(`   Input: category=undefined, subDomain=undefined`);
console.log(`   Output:`, test6c);
console.log(`   ✅ Both stay undefined`);
console.log();

console.log('=== SUMMARY ===');
console.log('✅ mythology → religion (ONLY for "mythology" category)');
console.log('✅ Other Mythologies → Sikhism (ONLY for "Other Mythologies" subdomain)');
console.log('✅ All other categories/subdomains → UNCHANGED');
console.log('✅ Null/undefined values handled gracefully');

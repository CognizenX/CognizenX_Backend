/**
 * Category Normalization Utility
 * 
 * Handles migration from "mythology" to "religion" category.
 * Maps legacy category/subdomain values to their new equivalents.
 * 
 * Mapping:
 * - mythology → religion
 * - Other Mythologies → Sikhism
 */

const LEGACY_CATEGORY_MAP = {
  mythology: 'religion',
};

const LEGACY_SUBDOMAIN_FALLBACK = {
  'Other Mythologies': 'Sikhism',
};

/**
 * Normalize legacy category/subDomain values to new names
 * Handles null/undefined/empty string cases gracefully
 * 
 * @param {string|null|undefined} category - The category to normalize
 * @param {string|null|undefined} subDomain - The subdomain to normalize
 * @returns {object} { category, subDomain } - normalized values (may be null/undefined if input was)
 */
function normalizeLegacyCategory(category, subDomain) {
  let normalizedCategory = category;
  let normalizedSubDomain = subDomain;

  // Map old category names to new ones
  if (category && category in LEGACY_CATEGORY_MAP) {
    normalizedCategory = LEGACY_CATEGORY_MAP[category];
  }

  // Handle fallback for "Other Mythologies" → "Sikhism"
  if (subDomain === 'Other Mythologies') {
    normalizedSubDomain = LEGACY_SUBDOMAIN_FALLBACK['Other Mythologies'];
  }

  return {
    category: normalizedCategory,
    subDomain: normalizedSubDomain,
  };
}

module.exports = { normalizeLegacyCategory };

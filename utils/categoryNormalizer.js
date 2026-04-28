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
  'other mythologies': 'Sikhism',
};

function normKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

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

  // Map old category names to new ones (case-insensitive)
  const categoryKey = normKey(category);
  if (categoryKey) {
    normalizedCategory = LEGACY_CATEGORY_MAP[categoryKey] || categoryKey;
  }

  // Handle fallback for "Other Mythologies" → "Sikhism" (case-insensitive)
  const subDomainKey = normKey(subDomain);
  if (subDomainKey && subDomainKey in LEGACY_SUBDOMAIN_FALLBACK) {
    normalizedSubDomain = LEGACY_SUBDOMAIN_FALLBACK[subDomainKey];
  } else if (subDomain != null) {
    normalizedSubDomain = String(subDomain).trim();
  }

  return {
    category: normalizedCategory,
    subDomain: normalizedSubDomain,
  };
}

module.exports = { normalizeLegacyCategory };

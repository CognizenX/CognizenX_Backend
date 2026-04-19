const { categories } = require("../config/categories");

const LEGACY_CATEGORY_ALIASES = {
  mythology: "religion",
};

const RELIGION_SUBDOMAIN_ALIASES = {
  Hindu: ["hindu", "hindu mythology"],
  Islam: ["islam", "islamic", "islam mythology"],
  Christianity: ["christianity", "christinanity", "christian"],
  Sikhism: [
    "sikhism",
    "sikh",
    "other mythology",
    "Other Mythologies",
    "others mythology",
    "others mythologies",
  ],
  Buddhism: ["buddhism", "buddhist"],
  Jainism: ["jainism", "jain"],
};

function toKey(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeCaseInsensitiveExactMatch(value) {
  return new RegExp(`^${escapeRegex(value)}$`, "i");
}

function getCanonicalCategories() {
  return Object.keys(categories || {});
}

function getCanonicalSubDomains(category) {
  const categoryKey = toKey(category);
  const categoryConfig = categories?.[categoryKey] || {};
  return Object.keys(categoryConfig);
}

function getCanonicalSubDomainMap(category) {
  const categoryKey = toKey(category);
  const categoryConfig = categories?.[categoryKey] || {};
  return Object.fromEntries(
    Object.keys(categoryConfig).map((subDomain) => [toKey(subDomain), subDomain])
  );
}

function normaliseCategory(category) {
  const raw = String(category || "").trim();
  const key = toKey(raw);
  if (!key) return "";

  const canonicalCategories = getCanonicalCategories();
  const canonicalMatch = canonicalCategories.find((entry) => toKey(entry) === key);
  if (canonicalMatch) {
    return canonicalMatch;
  }

  if (LEGACY_CATEGORY_ALIASES[key]) {
    return LEGACY_CATEGORY_ALIASES[key];
  }

  return raw;
}

function normaliseSubDomain(subDomain, category) {
  const raw = String(subDomain || "").trim();
  const key = toKey(raw);
  if (!key) return "";

  const canonicalCategory = normaliseCategory(category);
  const canonicalSubDomainMap = getCanonicalSubDomainMap(canonicalCategory);
  if (canonicalSubDomainMap[key]) {
    return canonicalSubDomainMap[key];
  }

  if (canonicalCategory === "religion") {
    for (const [canonical, aliases] of Object.entries(RELIGION_SUBDOMAIN_ALIASES)) {
      if (aliases.includes(key)) {
        return canonical;
      }
    }
  }

  return raw;
}

function getCategoryAliases(category) {
  const canonical = normaliseCategory(category);
  if (!canonical) {
    return [];
  }

  const aliases = [canonical, toKey(canonical)];
  for (const [legacyAlias, canonicalCategory] of Object.entries(LEGACY_CATEGORY_ALIASES)) {
    if (canonicalCategory === canonical) {
      aliases.push(legacyAlias);
    }
  }

  return Array.from(new Set(aliases.map((value) => String(value || "").trim()).filter(Boolean)));
}

function getSubDomainAliases(subDomain, category) {
  const canonicalSubDomain = normaliseSubDomain(subDomain, category);
  const canonicalCategory = normaliseCategory(category);

  if (!canonicalSubDomain) {
    return [];
  }

  if (canonicalCategory === "religion") {
    const aliases = RELIGION_SUBDOMAIN_ALIASES[canonicalSubDomain] || [];
    const values = [canonicalSubDomain, toKey(canonicalSubDomain), ...aliases];
    return Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean)));
  }

  return Array.from(
    new Set([canonicalSubDomain, toKey(canonicalSubDomain), String(subDomain || "").trim()].filter(Boolean))
  );
}

function normaliseTaxonomyInput({ category, subDomain, domain } = {}) {
  const normalizedCategory = normaliseCategory(category);
  const providedSubDomain = subDomain || domain;
  const normalizedSubDomain = normaliseSubDomain(providedSubDomain, normalizedCategory);

  return {
    category: normalizedCategory,
    subDomain: normalizedSubDomain,
  };
}

function buildCategoryOnlyQuery(category) {
  const categoryAliases = getCategoryAliases(category);
  return {
    category: { $in: categoryAliases.map(makeCaseInsensitiveExactMatch) },
  };
}

function buildCategorySubDomainQuery(category, subDomain) {
  const query = buildCategoryOnlyQuery(category);
  const subDomainAliases = getSubDomainAliases(subDomain, category);

  if (subDomainAliases.length) {
    const subDomainMatchers = subDomainAliases.map(makeCaseInsensitiveExactMatch);
    query.subDomain = { $in: subDomainMatchers };
  }

  return query;
}

module.exports = {
  normaliseCategory,
  normaliseSubDomain,
  normaliseTaxonomyInput,
  buildCategoryOnlyQuery,
  buildCategorySubDomainQuery,
};

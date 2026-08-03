/**
 * Pure helpers for semantic near-duplicate clustering and keeper selection.
 * Used by scripts/purge-semantic-duplicates.js and unit tests.
 */

const { cosineSimilarity } = require('./questionSimilarity');

function questionAgeMs(question) {
  if (question?.createdAt) {
    const t = new Date(question.createdAt).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (question?._id) {
    try {
      const hex = String(question._id).slice(0, 8);
      const seconds = Number.parseInt(hex, 16);
      if (Number.isFinite(seconds)) return seconds * 1000;
    } catch {
      // fall through
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Prefer seenGlobally, then older createdAt/_id.
 */
function compareKeepers(a, b) {
  const seenA = a?.seenGlobally === true ? 1 : 0;
  const seenB = b?.seenGlobally === true ? 1 : 0;
  if (seenB !== seenA) return seenB - seenA;

  const ageA = questionAgeMs(a);
  const ageB = questionAgeMs(b);
  if (ageA !== ageB) return ageA - ageB;

  return String(a?._id || '').localeCompare(String(b?._id || ''));
}

function selectKeeper(clusterQuestions) {
  if (!Array.isArray(clusterQuestions) || clusterQuestions.length === 0) {
    return null;
  }
  return [...clusterQuestions].sort(compareKeepers)[0];
}

function createUnionFind(size) {
  const parent = Array.from({ length: size }, (_, i) => i);
  const rank = Array.from({ length: size }, () => 0);

  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  function union(a, b) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    if (rank[rootA] < rank[rootB]) {
      parent[rootA] = rootB;
    } else if (rank[rootA] > rank[rootB]) {
      parent[rootB] = rootA;
    } else {
      parent[rootB] = rootA;
      rank[rootA] += 1;
    }
  }

  return { find, union };
}

/**
 * Build similarity pairs and connected-component clusters.
 *
 * @param {Array<{ id: string, embedding: number[], question?: object }>} entries
 * @param {number} threshold
 * @returns {{ pairs: Array<{ idA: string, idB: string, score: number }>, clusters: string[][] }}
 */
function buildSimilarityClusters(entries, threshold) {
  const pairs = [];
  if (!Array.isArray(entries) || entries.length < 2) {
    return { pairs, clusters: [] };
  }

  const { find, union } = createUnionFind(entries.length);

  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const score = cosineSimilarity(entries[i].embedding, entries[j].embedding);
      if (score >= threshold) {
        pairs.push({
          idA: entries[i].id,
          idB: entries[j].id,
          score,
        });
        union(i, j);
      }
    }
  }

  const groups = new Map();
  for (let i = 0; i < entries.length; i += 1) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(entries[i].id);
  }

  const clusters = [...groups.values()].filter((ids) => ids.length >= 2);
  return { pairs, clusters };
}

/**
 * From clusters of question ids + question map, decide keepers and removals.
 *
 * @param {string[][]} clusters
 * @param {Map<string, object>|Record<string, object>} questionsById
 * @returns {{ decisions: Array<{ keepId: string, removeIds: string[], members: string[] }>, removeIds: string[] }}
 */
function decideRemovals(clusters, questionsById) {
  const get = (id) =>
    questionsById instanceof Map ? questionsById.get(id) : questionsById[id];

  const decisions = [];
  const removeIds = [];

  for (const members of clusters) {
    const questions = members.map((id) => get(id)).filter(Boolean);
    if (questions.length < 2) continue;

    const keeper = selectKeeper(questions);
    if (!keeper) continue;

    const keepId = String(keeper._id);
    const dropIds = members.filter((id) => id !== keepId);
    if (dropIds.length === 0) continue;

    decisions.push({ keepId, removeIds: dropIds, members });
    removeIds.push(...dropIds);
  }

  return { decisions, removeIds };
}

module.exports = {
  questionAgeMs,
  compareKeepers,
  selectKeeper,
  buildSimilarityClusters,
  decideRemovals,
};

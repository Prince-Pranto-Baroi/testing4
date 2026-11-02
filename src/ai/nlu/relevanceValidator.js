// Rejects retrieved knowledge results that don't actually match the
// current intent - this is what stops a stray "fish diseases" row (e.g.
// Ich) from being handed to the model when the user asked a WATER_
// PARAMETERS question.
const { CATEGORY_MAP } = require('./queryBuilder');

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(w => w.length >= 2);
}

function overlapScore(queryTerms, text) {
  const docTokens = new Set(tokenize(text));
  if (docTokens.size === 0 || queryTerms.length === 0) return 0;
  let hits = 0;
  for (const term of queryTerms) {
    if (docTokens.has(term.toLowerCase())) hits++;
  }
  return hits / queryTerms.length;
}

/**
 * @param {{intent: string, queryTerms: string[]}} params
 * @param {Array<{title, category, content}>} results
 * @returns {{acceptable: boolean, semanticScore: number, intentMatch: boolean, filtered: Array}}
 */
function scoreRelevance({ intent, queryTerms }, results) {
  const expectedCategory = CATEGORY_MAP[intent];
  const scored = (results || []).map(r => {
    const intentMatch = !expectedCategory || r.category === expectedCategory;
    const semanticScore = overlapScore(queryTerms || [], `${r.title} ${r.content}`);
    return { ...r, intentMatch, semanticScore };
  });

  const filtered = scored.filter(r => r.intentMatch && r.semanticScore >= 0.12);
  const best = scored.reduce((max, r) => Math.max(max, r.intentMatch ? r.semanticScore : 0), 0);

  return {
    acceptable: filtered.length > 0,
    semanticScore: best,
    intentMatch: scored.some(r => r.intentMatch),
    filtered
  };
}

module.exports = { scoreRelevance, tokenize };

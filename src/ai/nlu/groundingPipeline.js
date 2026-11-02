// Per-turn grounding pipeline: classify the CURRENT message, build a fresh
// query from that classification (never a reused prior-turn query),
// retrieve, and validate relevance before anything is handed to the model.
const { classifyIntent } = require('./intentClassifier');
const { buildQuery } = require('./queryBuilder');
const { scoreRelevance, tokenize } = require('./relevanceValidator');
const knowledgeService = require('../knowledgeService');

const DEBUG = process.env.AI_DEBUG === 'true';
function log(label, value) {
  if (DEBUG) console.log(`[AI_DEBUG] ${label}:`, typeof value === 'string' ? value : JSON.stringify(value));
}

/**
 * @param {string} message current user message
 * @param {object|null} previousContext {intent, subIntent, entities} from the prior turn, or null
 */
async function runGroundingPipeline(message, previousContext) {
  const classification = classifyIntent(message, previousContext);
  log('USER_MESSAGE', message);
  log('DETECTED_LANGUAGE', classification.language);
  log('INTENT', classification.intent + (classification.subIntent ? ` (${classification.subIntent})` : ''));
  log('ENTITIES', classification.entities);
  log('USED_PREVIOUS_CONTEXT', classification.usedPreviousContext);

  const { query: searchQuery, category } = buildQuery(classification);
  log('GENERATED_SEARCH_QUERY', searchQuery);
  log('SEARCH_CATEGORY', category);

  let grounding = { acceptable: false, semanticScore: 0, filtered: [] };
  let rawResults = [];

  if (category) {
    rawResults = await knowledgeService.searchKnowledge(searchQuery, category, null);
    grounding = scoreRelevance({ intent: classification.intent, queryTerms: tokenize(searchQuery) }, rawResults);

    if (!grounding.acceptable) {
      // Retry once with a broader (uncategorized) search before giving up -
      // the category itself might just be slightly off.
      const broaderResults = await knowledgeService.searchKnowledge(searchQuery, null, null);
      const broaderScore = scoreRelevance({ intent: classification.intent, queryTerms: tokenize(searchQuery) }, broaderResults);
      if (broaderScore.acceptable) {
        rawResults = broaderResults;
        grounding = broaderScore;
      }
    }
  }

  log('RETRIEVED_RESULTS', rawResults.map(r => r.title));
  log('RELEVANCE_SCORE', grounding.semanticScore);

  return {
    classification,
    searchQuery,
    category,
    grounding
  };
}

module.exports = { runGroundingPipeline, log, DEBUG };

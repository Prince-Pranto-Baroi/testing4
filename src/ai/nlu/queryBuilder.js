// Turns a classification result into a clean searchKnowledge() query +
// category. Always derived from the CURRENT classification - never from a
// raw previous-turn query string, which is what caused the stale "ich"
// results bug.

// Intent -> knowledge_documents.category (matches values used across both
// seeded knowledge packs). null = no knowledge-base category (shopping
// intents, or genuinely nothing to search).
const CATEGORY_MAP = {
  WATER_PARAMETERS: 'water parameters',
  WATER_QUALITY: 'water parameters',
  FISH_DISEASE: 'fish diseases',
  FISH_EMERGENCY: 'fish diseases',
  FISH_CARE: 'fish care',
  FISH_IDENTIFICATION: 'fish care',
  FISH_COMPATIBILITY: 'fish care',
  FISH_BEHAVIOR: 'fish diseases', // behavior symptoms overlap heavily with the disease-triage doc's "possible causes" framing
  FISH_FEEDING: 'feeding breeding',
  FISH_BREEDING: 'feeding breeding',
  PLANT_CARE: 'plant care',
  PLANT_PROBLEM: 'plant problems',
  ALGAE: 'plant problems',
  TANK_SETUP: 'aquarium setup',
  MAINTENANCE: 'maintenance',
  SHRIMP_CARE: 'shrimp care',
  SNAIL_CARE: 'shrimp care',
  AQUASCAPING: 'aquascaping',
  // Shopping/support intents resolve via product/order tools, not RAG.
  PRODUCT_SEARCH: null,
  PRODUCT_INFORMATION: null,
  PRICE: null,
  ORDER: null,
  DELIVERY: null,
  UNKNOWN: null
};

// Sub-intent specific keyword to fold into the query text for a sharper match.
const SUBINTENT_KEYWORD = {
  PH: 'pH', GH: 'GH general hardness', KH: 'KH carbonate hardness buffering',
  TDS: 'TDS total dissolved solids', AMMONIA: 'ammonia', NITRITE: 'nitrite', NITRATE: 'nitrate',
  TEMPERATURE: 'temperature', CHLORINE: 'chlorine chloramine', OXYGEN: 'dissolved oxygen',
  WATER_COLOR: 'water discoloration color change', WATER_CHANGE: 'water change',
  PLANT_LIGHT: 'plant lighting', PLANT_CO2: 'plant CO2', PLANT_NUTRIENTS: 'plant nutrient deficiency fertilizer',
  PLANT_PROPAGATION: 'plant propagation trimming', PLANT_IDENTIFICATION: 'plant identification',
  SHRIMP_DISEASE: 'shrimp disease', SHRIMP_MOLTING: 'shrimp molting', SHRIMP_BREEDING: 'shrimp breeding',
  FILTER: 'filter', HEATER: 'heater', AERATION: 'aeration air pump', CO2_SYSTEM: 'CO2 system',
  SUBSTRATE: 'substrate', HARDSCAPE: 'hardscape', TANK_SIZE: 'tank size', CLEANING: 'cleaning'
};

function buildQuery(classification) {
  const { intent, subIntent, entities } = classification;
  const category = CATEGORY_MAP[intent] !== undefined ? CATEGORY_MAP[intent] : null;

  const parts = [];
  if (subIntent && SUBINTENT_KEYWORD[subIntent]) parts.push(SUBINTENT_KEYWORD[subIntent]);
  else parts.push(intent.replace(/_/g, ' ').toLowerCase());

  if (entities && entities.livestock && entities.livestock.length) {
    parts.push(entities.livestock.join(' '));
  }
  if (entities && entities.parameter && !parts.join(' ').toLowerCase().includes(entities.parameter.toLowerCase())) {
    parts.push(entities.parameter);
  }
  parts.push('aquarium freshwater');

  return { query: parts.join(' ').trim(), category };
}

module.exports = { buildQuery, CATEGORY_MAP };

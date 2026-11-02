// Deterministic intent classification + entity extraction.
//
// This exists specifically to stop the AI from answering the CURRENT
// message using the PREVIOUS turn's topic (e.g. asking about pH for
// shrimp/guppy and getting Ich/white-spot information back because the
// previous question was about a disease symptom). Classification always
// runs fresh on the current message first; previous-turn context is only
// merged in when the current message contains a clear reference cue
// ("what about shrimp?", "ogulo?", "and for guppy?") - never by default.
//
// Deliberately rule-based (not model-based): fast, free, debuggable, and
// works identically whether or not an AI_API_KEY is configured.

const { detectLanguage } = require('./language');

// ---------------------------------------------------------------------
// Intent -> matcher patterns (EN / বাংলা / Banglish combined per intent).
// Order matters: more specific/urgent intents are checked before general
// ones (see classifyIntent's INTENT_ORDER).
// ---------------------------------------------------------------------
const PATTERNS = {
  FISH_EMERGENCY: [
    /fish (just )?died|mach mara gে?che|mach mara gelo|মাছ মারা (গেছে|গেলো)/i,
    /sudden(ly)? (death|dying)|mass mortality|shobguli mara jacche|সব মাছ মরে যাচ্ছে/i,
    /gasping at (the )?surface|multiple fish.*(gasping|dying)/i
  ],
  FISH_DISEASE: [
    /\bich\b|white spot|sada\s?dag|সাদা\s?দাগ/i,
    /fin\s?rot|pakhna\s?poch|পাখনা\s?পচ|fraying fin/i,
    /dropsy|pinecone|pet\s?fule|পেট\s?ফুলে/i,
    /swim\s?bladder/i,
    /velvet|sonali\s?gura|সোনালি\s?গুঁড়ো/i,
    /columnaris|cotton wool/i,
    /pop\s?eye|chokh fule|চোখ\s?ফুলে/i,
    /disease|sick fish|fish.*(sick|ill)|osusto\s?mach|অসুস্থ\s?মাছ|mach.*osukh|রোগ|\brog\b/i,
    /parasite|fungus|fungal|ulcer|lesion|flukes?/i
  ],
  FISH_BEHAVIOR: [
    /(fish|mach|মাছ).{0,15}(gasping|breathing fast|fast breathing|rapid breath|hangat|হাঁপা)/i,
    /(fish|mach|মাছ).{0,15}(upor.?e uth|surface e uth|bottom sitting|hiding all the time)/i,
    /flashing|scratching against|glass e ghoshe/i
  ],
  FISH_COMPATIBILITY: [
    /compat|tank\s?mate|live (with|together)|kar sathe rakh|সাথে.*(রাখা|থাকতে)|which fish can live with/i
  ],
  FISH_FEEDING: [
    /feed(ing)?|what (food|to feed)|খাবার|khabar|ফিডিং/i
  ],
  FISH_BREEDING: [
    /breed(ing)?|fry\b|প্রজনন|bongshobriddhi|koraben|how (can|do) i breed/i
  ],
  FISH_IDENTIFICATION: [
    /what (fish|species) is this|identify (this|my) fish|ei mach ki|এই মাছ কী/i
  ],
  SHRIMP_MOLTING: [
    /molt(ing)?/i
  ],
  SHRIMP_DISEASE: [
    /shrimp.{0,20}(disease|sick|dying|dead)|chingri.{0,20}(rog|mara)/i
  ],
  SHRIMP_BREEDING: [
    /shrimp.{0,20}breed|chingri.{0,20}breed/i
  ],
  SHRIMP_CARE: [
    /shrimp|chingri|চিংড়ি|neocaridina|caridina|amano/i
  ],
  SNAIL_CARE: [
    /snail|শামুক|nerite|mystery snail|ramshorn|assassin snail|malaysian trumpet/i
  ],
  PH: [
    /\bph\b|পি\s?এইচ|acidity|alkalin/i
  ],
  GH: [
    /\bgh\b|general hardness/i
  ],
  KH: [
    /\bkh\b|carbonate hardness|buffering capacity/i
  ],
  TDS: [
    /\btds\b|total dissolved solids/i
  ],
  AMMONIA: [
    /ammonia|অ্যামোনিয়া/i
  ],
  NITRITE: [
    /nitrite|নাইট্রাইট/i
  ],
  NITRATE: [
    /nitrate|নাইট্রেট/i
  ],
  TEMPERATURE: [
    /\btemp(erature)?\b|তাপমাত্রা|tapmatra/i
  ],
  CHLORINE: [
    /chlorine|chloramine|dechlorinat/i
  ],
  OXYGEN: [
    /oxygen|\bO2\b|অক্সিজেন/i
  ],
  WATER_COLOR: [
    /water.{0,15}(color|colour|red|reddish|pink|brown|yellow|cloudy|milky|tea.?colou?red)/i,
    /pani.{0,15}(rong|lal|lalche|dhola|ghola)|পানি.{0,15}(রং|লাল|লালচে|ঘোলা)/i
  ],
  ALGAE: [
    /algae|শৈবাল|অ্যালজি|green spot|black beard|diatom|cyanobacteria|hair algae/i,
    /water.{0,10}(is\s*)?green|green.{0,10}water|pani.{0,10}shobuj|পানি.{0,10}সবুজ/i
  ],
  WATER_CHANGE: [
    /water change|pani\s?(change|poriborton)|পানি\s?পরিবর্তন/i
  ],
  WATER_PARAMETERS: [
    /water parameter|pani.{0,10}(test|parameter)|পানি.{0,10}(টেস্ট|প্যারামিটার)|water quality|pani.{0,10}(bhalo|kharap)/i
  ],
  PLANT_PROBLEM: [
    /(leaf|leaves|pata).{0,15}(yellow|holud|brown|melt|drop|hole)|plant.{0,15}(dying|melt|problem)|gach.{0,15}(noshto|mara)/i
  ],
  PLANT_LIGHT: [
    /plant.{0,15}light|gach.{0,15}(alo|light)/i
  ],
  PLANT_CO2: [
    /\bco2\b.{0,15}plant|plant.{0,15}co2/i
  ],
  PLANT_NUTRIENTS: [
    /fertiliz|nutrient deficien|plant.{0,15}(nutrient|fertilizer)/i
  ],
  PLANT_PROPAGATION: [
    /propagat|cutting|trim.{0,10}plant/i
  ],
  PLANT_IDENTIFICATION: [
    /what plant is this|identify (this|my) plant|ei gach ki/i
  ],
  PLANT_CARE: [
    /\bplant\b|গাছ|\bgach\b/i
  ],
  AQUASCAPING: [
    /aquascap|iwagumi|dutch style|nature aquarium|hardscape layout/i
  ],
  FILTER: [
    /\bfilter\b|ফিল্টার/i
  ],
  LIGHTING: [
    /\blight(ing)?\b(?!.{0,15}plant)|লাইট/i
  ],
  HEATER: [
    /\bheater\b|হিটার/i
  ],
  AERATION: [
    /air ?pump|aeration|air stone/i
  ],
  CO2_SYSTEM: [
    /\bco2\b(?!.{0,15}plant)/i
  ],
  SUBSTRATE: [
    /substrate|gravel|aquasoil|বালি|নুড়ি/i
  ],
  HARDSCAPE: [
    /hardscape|driftwood|rock(s)? in (the )?tank/i
  ],
  TANK_SIZE: [
    /tank size|how big.*tank|koto liter|কত লিটার/i
  ],
  TANK_SETUP: [
    /new tank|set ?up|(tank).*(start|begin)|নতুন ট্যাংক/i
  ],
  CLEANING: [
    /clean(ing)?|পরিষ্কার/i
  ],
  MAINTENANCE: [
    /maintenance|routine|রুটিন/i
  ],
  PRICE: [
    /price|koto taka|দাম|কত টাকা|cost/i
  ],
  DELIVERY: [
    /deliver|shipping|koto diner moddhe pabo/i
  ],
  ORDER: [
    /\border\b|track my order|order status/i
  ],
  PRODUCT_INFORMATION: [
    /tell me about (this|the) product|product detail/i
  ],
  PRODUCT_SEARCH: [
    /do you (have|sell)|is .* in stock|searchProducts|show me (fish|plants|shrimp|equipment)/i
  ]
};

// Order in which intents are tested. Earlier = higher priority when a
// message matches more than one pattern (e.g. "shrimp pH" should resolve
// to PH with a shrimp entity, not SHRIMP_CARE swallowing everything).
const INTENT_ORDER = [
  'FISH_EMERGENCY', 'FISH_DISEASE', 'SHRIMP_DISEASE', 'SHRIMP_MOLTING', 'SHRIMP_BREEDING',
  'FISH_BEHAVIOR',
  'PH', 'GH', 'KH', 'TDS', 'AMMONIA', 'NITRITE', 'NITRATE', 'TEMPERATURE', 'CHLORINE', 'OXYGEN',
  'WATER_COLOR', 'ALGAE', 'WATER_CHANGE', 'WATER_PARAMETERS',
  'PLANT_PROBLEM', 'PLANT_LIGHT', 'PLANT_CO2', 'PLANT_NUTRIENTS', 'PLANT_PROPAGATION', 'PLANT_IDENTIFICATION',
  'FISH_COMPATIBILITY', 'FISH_FEEDING', 'FISH_BREEDING', 'FISH_IDENTIFICATION',
  'SHRIMP_CARE', 'SNAIL_CARE',
  'AQUASCAPING',
  'FILTER', 'HEATER', 'AERATION', 'CO2_SYSTEM', 'SUBSTRATE', 'HARDSCAPE', 'TANK_SIZE', 'TANK_SETUP',
  'CLEANING', 'MAINTENANCE',
  'PRICE', 'DELIVERY', 'ORDER', 'PRODUCT_INFORMATION', 'PRODUCT_SEARCH',
  'PLANT_CARE'
];

// Sub-intent -> parent intent grouping, so downstream code can map e.g.
// PH to the broader WATER_PARAMETERS family without losing the specific
// sub-intent for query building.
const PARENT_INTENT = {
  PH: 'WATER_PARAMETERS', GH: 'WATER_PARAMETERS', KH: 'WATER_PARAMETERS', TDS: 'WATER_PARAMETERS',
  AMMONIA: 'WATER_PARAMETERS', NITRITE: 'WATER_PARAMETERS', NITRATE: 'WATER_PARAMETERS',
  TEMPERATURE: 'WATER_PARAMETERS', CHLORINE: 'WATER_PARAMETERS', OXYGEN: 'WATER_PARAMETERS',
  WATER_COLOR: 'WATER_QUALITY', WATER_CHANGE: 'WATER_QUALITY',
  SHRIMP_DISEASE: 'SHRIMP_CARE', SHRIMP_MOLTING: 'SHRIMP_CARE', SHRIMP_BREEDING: 'SHRIMP_CARE',
  PLANT_PROBLEM: 'PLANT_CARE', PLANT_LIGHT: 'PLANT_CARE', PLANT_CO2: 'PLANT_CARE',
  PLANT_NUTRIENTS: 'PLANT_CARE', PLANT_PROPAGATION: 'PLANT_CARE', PLANT_IDENTIFICATION: 'PLANT_CARE',
  FILTER: 'TANK_SETUP', HEATER: 'TANK_SETUP', AERATION: 'TANK_SETUP', CO2_SYSTEM: 'TANK_SETUP',
  SUBSTRATE: 'TANK_SETUP', HARDSCAPE: 'TANK_SETUP', TANK_SIZE: 'TANK_SETUP',
  CLEANING: 'MAINTENANCE'
};

// Entity dictionaries -----------------------------------------------------
const LIVESTOCK_TERMS = [
  ['guppy', /guppy|guppies|গাপ্পি/i],
  ['betta', /betta|বেটা/i],
  ['neocaridina shrimp', /neocaridina/i],
  ['caridina shrimp', /caridina/i],
  ['amano shrimp', /amano/i],
  ['shrimp', /shrimp|chingri|চিংড়ি/i],
  ['snail', /snail|শামুক|nerite|mystery snail|ramshorn/i],
  ['tetra', /tetra|টেট্রা/i],
  ['cichlid', /cichlid|সিচলিড/i],
  ['goldfish', /goldfish|গোল্ডফিশ/i],
  ['discus', /discus|ডিসকাস/i],
  ['molly', /\bmolly\b/i],
  ['platy', /\bplaty\b/i],
  ['corydoras', /cory(doras)?/i],
  ['angelfish', /angelfish/i]
];

const PARAMETER_TERMS = [
  ['pH', /\bph\b|পিএইচ/i],
  ['GH', /\bgh\b/i],
  ['KH', /\bkh\b/i],
  ['TDS', /\btds\b/i],
  ['ammonia', /ammonia|অ্যামোনিয়া/i],
  ['nitrite', /nitrite|নাইট্রাইট/i],
  ['nitrate', /nitrate|নাইট্রেট/i],
  ['temperature', /temp(erature)?|তাপমাত্রা/i],
  ['chlorine', /chlorine|chloramine/i],
  ['oxygen', /oxygen|অক্সিজেন/i]
];

// Reference cues that mean "this message depends on the previous topic".
// Kept intentionally narrow - a plain new statement should NOT match
// these, or we'd re-introduce the stale-context bug from the other side.
const REFERENCE_CUES = [
  /^(what|how) about\b/i,
  /^and (for|about)\b/i,
  /\b(ogulo|oitar jonno|oi\s?(gula|ta)|shei\s?(ta|gula)|tader jonno|er jonno)\b/i,
  /\b(same|that|this) (for|question)\b/i,
  /^(ওগুলো|ওটার জন্য|সেটার জন্য|তাদের জন্য)/
];

function extractEntities(message) {
  const livestock = [];
  for (const [label, re] of LIVESTOCK_TERMS) {
    if (re.test(message) && !livestock.includes(label)) livestock.push(label);
  }
  let parameter = null;
  for (const [label, re] of PARAMETER_TERMS) {
    if (re.test(message)) { parameter = label; break; }
  }
  return { livestock, parameter };
}

function looksLikeReference(message) {
  return REFERENCE_CUES.some(re => re.test(message.trim()));
}

// Word count excluding punctuation - used to decide if a message is too
// short/thin to carry its own intent (e.g. "shrimp?" or "guppy o?").
function wordCount(message) {
  return message.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Classify the CURRENT message. `previousContext` (optional) is
 * { intent, subIntent, entities } from the prior turn, used ONLY when the
 * current message is short and/or contains an explicit reference cue -
 * never merged in by default.
 */
function classifyIntent(message, previousContext = null) {
  const language = detectLanguage(message);
  let matchedIntent = 'UNKNOWN';
  let confidence = 'low';

  for (const intent of INTENT_ORDER) {
    const patterns = PATTERNS[intent];
    if (patterns.some(re => re.test(message))) {
      matchedIntent = intent;
      confidence = 'high';
      break;
    }
  }

  let entities = extractEntities(message);

  const isThin = wordCount(message) <= 4;
  const hasReference = looksLikeReference(message);
  let usedPreviousContext = false;

  if (previousContext && (hasReference || (matchedIntent === 'UNKNOWN' && isThin))) {
    // Only ever inherit the previous INTENT when the current message
    // truly carries no intent signal of its own. If the current message
    // matched its own intent, keep it - we only borrow missing entities
    // (e.g. "and for shrimp?" after a PH question stays PH, adds shrimp).
    if (matchedIntent === 'UNKNOWN' && previousContext.intent) {
      matchedIntent = previousContext.intent;
      confidence = 'moderate';
      usedPreviousContext = true;
    }
    if (entities.livestock.length === 0 && previousContext.entities && previousContext.entities.livestock) {
      entities = { ...entities, livestock: previousContext.entities.livestock };
      usedPreviousContext = true;
    }
    if (!entities.parameter && previousContext.entities && previousContext.entities.parameter) {
      entities = { ...entities, parameter: previousContext.entities.parameter };
      usedPreviousContext = true;
    }
  }

  const parentIntent = PARENT_INTENT[matchedIntent] || matchedIntent;

  return {
    intent: parentIntent,
    subIntent: matchedIntent !== parentIntent ? matchedIntent : null,
    entities,
    language,
    confidence,
    usedPreviousContext
  };
}

module.exports = { classifyIntent, extractEntities, looksLikeReference, PARENT_INTENT };

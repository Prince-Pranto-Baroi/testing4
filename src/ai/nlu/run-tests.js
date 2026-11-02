// Standalone test runner for the intent classifier + query builder +
// relevance/answer validators. Pure functions, no DB/HTTP/API key needed:
//   node server/ai/nlu/run-tests.js
const { classifyIntent } = require('./intentClassifier');
const { buildQuery } = require('./queryBuilder');
const { scoreRelevance } = require('./relevanceValidator');
const { validateAnswer } = require('./answerValidator');

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) {
    passed++;
    console.log(`OK   ${name} -> ${actual}`);
  } else {
    failed++;
    console.log(`FAIL ${name} -> got "${actual}", expected "${expected}"`);
  }
}

console.log('=== Section 16: intent classification test cases ===\n');

const cases = [
  ['which ph is suitable for shrimp and guppy fish?', 'WATER_PARAMETERS'],
  ['shrimp er jonno koto ph valo?', 'WATER_PARAMETERS'],
  ['why does my fish have white spots?', 'FISH_DISEASE'],
  ['amar guppy mach fast breathing korche', 'FISH_BEHAVIOR'],
  ['my aquarium water is green', 'ALGAE'],
  ['amar pani lalche hoye geche', 'WATER_QUALITY'],
  ['how do I clean my aquarium?', 'MAINTENANCE'],
  ['which filter should I use?', 'TANK_SETUP'],
  ['amar plant er pata holud hoye jacche', 'PLANT_CARE'],
  ['which fish can live with guppy?', 'FISH_COMPATIBILITY'],
  ['shrimp molting problem', 'SHRIMP_CARE'],
  ['what food should I give my betta?', 'FISH_FEEDING'],
  ['how can I breed guppies?', 'FISH_BREEDING'],
  ['tank e algae hoyeche ki korbo?', 'ALGAE'],
  ['my fish died suddenly', 'FISH_EMERGENCY'],
];

for (const [message, expectedIntent] of cases) {
  const result = classifyIntent(message);
  check(message, result.intent, expectedIntent);
}

console.log('\n=== Critical bug scenario: stale topic must NOT leak ===\n');

// Turn 1: reddish water
const turn1 = classifyIntent('my water looks so redish colour is this any problem?');
check('turn1 intent (reddish water)', turn1.intent, 'WATER_QUALITY');

// Turn 2, with turn1 as previous context: must be WATER_PARAMETERS, not
// carried over as WATER_QUALITY/disease, and must NOT mention ich.
const turn2 = classifyIntent('which water parameter is suitable for shrimps and guppy fish?', {
  intent: turn1.intent,
  subIntent: turn1.subIntent,
  entities: turn1.entities
});
check('turn2 intent (pH for shrimp/guppy) ignores stale topic', turn2.intent, 'WATER_PARAMETERS');
check('turn2 did NOT inherit previous context', turn2.usedPreviousContext, false);

const turn2Query = buildQuery(turn2);
console.log(`turn2 search query: "${turn2Query.query}" / category: "${turn2Query.category}"`);
if (/\bich\b/i.test(turn2Query.query)) {
  failed++; console.log('FAIL turn2 query must not mention ich');
} else {
  passed++; console.log('OK   turn2 query does not mention ich');
}

// Reverse order: disease question after a pH question must switch fully.
const priorPh = classifyIntent('what pH is good for shrimp?');
const thenDisease = classifyIntent('my guppy has white spots.', {
  intent: priorPh.intent, subIntent: priorPh.subIntent, entities: priorPh.entities
});
check('disease question after pH question switches intent', thenDisease.intent, 'FISH_DISEASE');

console.log('\n=== Reference-cue inheritance (SHOULD merge) ===\n');
const phFirst = classifyIntent('what pH is good for shrimp?');
const followUp = classifyIntent('what about guppy?', {
  intent: phFirst.intent, subIntent: phFirst.subIntent, entities: phFirst.entities
});
check('short reference follow-up inherits previous intent', followUp.intent, 'WATER_PARAMETERS');

console.log('\n=== Relevance validation ===\n');
const badResults = [
  { title: 'Common Fish Diseases: Symptoms and Treatment', category: 'fish diseases', content: 'Ich / White Spot Disease ...' }
];
const badScore = scoreRelevance({ intent: 'WATER_PARAMETERS', queryTerms: ['ph', 'shrimp', 'guppy'] }, badResults);
check('mismatched category rejected', badScore.acceptable, false);

const goodResults = [
  { title: 'Water Parameters: Ammonia, Nitrite, Nitrate, pH, GH, KH', category: 'water parameters', content: 'pH: most community freshwater fish want 6.5-7.5 ...' }
];
const goodScore = scoreRelevance({ intent: 'WATER_PARAMETERS', queryTerms: ['ph', 'shrimp', 'guppy'] }, goodResults);
check('matching category accepted', goodScore.acceptable, true);

console.log('\n=== Answer validation (topic-mismatch guard) ===\n');
const badAnswer = "Ich (white spot disease): tiny white dots on the body and fins, raise temperature to 28-30C and add aquarium salt.";
const v1 = validateAnswer({ intent: 'WATER_PARAMETERS', answer: badAnswer });
check('answer about ich rejected for a WATER_PARAMETERS question', v1.pass, false);

const goodAnswer = "For guppies and Neocaridina shrimp, aim for a pH around 6.5-7.5 - guppies tolerate a wider range, but shrimp prefer it stable.";
const v2 = validateAnswer({ intent: 'WATER_PARAMETERS', answer: goodAnswer });
check('on-topic pH answer accepted', v2.pass, true);

const certaintyAnswer = "This is definitely Ich and this medicine will guarantee a cure.";
const v3 = validateAnswer({ intent: 'FISH_DISEASE', answer: certaintyAnswer });
check('overconfident certainty language flagged', v3.pass, false);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

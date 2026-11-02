// Last line of defense: even with correct classification + grounding, an
// LLM can still drift back to a previous topic. This does a cheap
// deterministic check on the actual answer text before it's shown.

// Terms that are distinctive of ONE intent family and should not dominate
// an answer for a different intent. Keyed by the intent whose terms these
// are; checked against every OTHER intent's answers.
const DISEASE_SIGNATURE_TERMS = [
  'ich', 'white spot', 'fin rot', 'dropsy', 'columnaris', 'popeye', 'velvet disease',
  'swim bladder', 'cotton wool', 'fungal infection'
];

const INTENT_EXPECTED_TERMS = {
  WATER_PARAMETERS: ['ph', 'ammonia', 'nitrite', 'nitrate', 'gh', 'kh', 'tds', 'temperature', 'hardness', 'water'],
  WATER_QUALITY: ['water', 'color', 'colour', 'clarity', 'cloudy', 'tannin'],
  ALGAE: ['algae'],
  PLANT_CARE: ['plant', 'leaf', 'leaves'],
  SHRIMP_CARE: ['shrimp', 'molt'],
  MAINTENANCE: ['clean', 'maintenance', 'water change', 'filter'],
  TANK_SETUP: ['tank', 'filter', 'light', 'heater', 'substrate']
};

const CERTAINTY_RED_FLAGS = [
  /\b100%\s*(cure|disease|diagnosis|certain)/i,
  /\bguarantee(d)?\s*(a\s*)?(cure|to work|survival|result)/i,
  /\bdefinitely\s+(is|has|cures|will)/i,
  /\bwill\s+definitely\s+(work|cure)/i,
  /\bcertainly\s+(is|has)\b.{0,20}(disease|ich|infection)/i
];

// whole-word match, so "ich" does not match inside "which" / "rich"
function containsAnyWord(text, terms) {
  return terms.filter(t => new RegExp('(^|[^a-z])' + t.replace(/ /g, '\\s+') + '([^a-z]|$)', 'i').test(text)).length;
}

function containsAny(text, terms) {
  const lower = text.toLowerCase();
  return terms.filter(t => lower.includes(t)).length;
}

/**
 * @param {{intent: string, answer: string, previousIntent?: string}} params
 * @returns {{pass: boolean, reasons: string[]}}
 */
function validateAnswer({ intent, answer, previousIntent }) {
  const reasons = [];
  if (!answer || !answer.trim()) {
    return { pass: false, reasons: ['empty_answer'] };
  }

  // A. Topic-mismatch: disease-specific vocabulary dominating an answer to
  // a clearly different, non-disease intent.
  const isDiseaseIntent = intent === 'FISH_DISEASE' || intent === 'FISH_EMERGENCY' || intent === 'FISH_BEHAVIOR' || intent === 'UNKNOWN';
  if (!isDiseaseIntent) {
    const diseaseHits = containsAnyWord(answer, DISEASE_SIGNATURE_TERMS);
    const expectedTerms = INTENT_EXPECTED_TERMS[intent];
    const expectedHits = expectedTerms ? containsAny(answer, expectedTerms) : 1; // no defined term set -> don't penalize
    if (diseaseHits >= 2 && diseaseHits > expectedHits) {
      reasons.push('topic_mismatch_disease_leak');
    }
  }

  // B. Unsupported certainty language.
  if (CERTAINTY_RED_FLAGS.some(re => re.test(answer))) {
    reasons.push('unsupported_certainty');
  }

  return { pass: reasons.length === 0, reasons };
}

// Best-effort deterministic softening for certainty red flags, applied
// when we choose to repair rather than fully regenerate the answer.
function softenCertainty(answer) {
  return answer
    .replace(/\bthis is definitely\b/gi, 'this looks consistent with')
    .replace(/\bdefinitely (is|has)\b/gi, 'may $1')
    .replace(/\bguarantee(d)? (a )?cure\b/gi, 'no guaranteed cure, but this often helps')
    .replace(/\bwill definitely (work|cure)\b/gi, 'often helps, though results vary')
    .replace(/\b100%\s*(cure|disease|diagnosis|certain)/gi, 'likely $1');
}

module.exports = { validateAnswer, softenCertainty, DISEASE_SIGNATURE_TERMS };

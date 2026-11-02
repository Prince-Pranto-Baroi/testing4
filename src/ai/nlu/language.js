// Zero-dependency language detector (Bangla script / Banglish / English).
// Kept dependency-free on purpose so the NLU layer can be unit-tested
// without a database connection or any npm packages installed.
function detectLanguage(text = '') {
  if (/[\u0980-\u09FF]/.test(text)) return 'bn'; // Bangla script present
  const banglishHints = /\b(ki|kemon|koro|korbo|hobe|pani|mach|matha|ache|nai|kivabe|kotota|koto|dorkar|lagbe|bhalo|kharap|gaye|pakhna|amar|kore|hocche|hoyeche)\b/i;
  if (banglishHints.test(text)) return 'bn-latn'; // Bangla written in Latin letters
  return 'en';
}

module.exports = { detectLanguage };

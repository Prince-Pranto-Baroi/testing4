// Knowledge service - RAG for aquarium expertise
// Supports English, Bangla (bn) and Banglish (bn-latn) content, and degrades
// gracefully on small datasets where MySQL's natural-language FULLTEXT mode
// (50% threshold, stopwords, 4-char minimum) can return nothing useful.
const { query } = require('./db');
const { detectLanguage } = require('./nlu/language');

async function fullTextSearch(searchQuery, category, language) {
  let sql = `
    SELECT id, title, category, content, source, language,
           MATCH(title, content) AGAINST(? IN NATURAL LANGUAGE MODE) as relevance
    FROM knowledge_documents
    WHERE MATCH(title, content) AGAINST(? IN NATURAL LANGUAGE MODE)
  `;
  const params = [searchQuery, searchQuery];

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (language) {
    sql += ' AND language = ?';
    params.push(language);
  }

  sql += ' ORDER BY relevance DESC LIMIT 6';
  return await query(sql, params);
}

async function keywordFallbackSearch(searchQuery, category, language) {
  // Fulltext can legitimately return zero rows on a small table (short
  // words, 50%-of-rows threshold, etc). Fall back to a plain LIKE scan over
  // the meaningful words in the query so users still get an answer.
  const words = (searchQuery || '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(w => w.length >= 2)
    .slice(0, 6);

  if (words.length === 0) return [];

  let sql = `
    SELECT id, title, category, content, source, language, 1 as relevance
    FROM knowledge_documents
    WHERE (${words.map(() => '(title LIKE ? OR content LIKE ?)').join(' OR ')})
  `;
  const params = [];
  for (const w of words) {
    params.push(`%${w}%`, `%${w}%`);
  }

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (language) {
    sql += ' AND language = ?';
    params.push(language);
  }

  sql += ' LIMIT 6';
  return await query(sql, params);
}

async function searchKnowledge(searchQuery, category = null, language = null) {
  // Prefer documents in the caller's detected language, but never withhold
  // good English reference material just because the user wrote in Bangla.
  let results = [];
  try {
    results = await fullTextSearch(searchQuery, category, language);
  } catch (err) {
    // e.g. FULLTEXT index missing on an older DB - degrade silently
    results = [];
  }

  if (results.length === 0) {
    results = await keywordFallbackSearch(searchQuery, category, language);
  }

  if (results.length === 0 && language) {
    // Retry without the language filter so we still surface something.
    results = await keywordFallbackSearch(searchQuery, category, null);
  }

  return results;
}

async function getAdvice({ topic, tankSize, experience, language }) {
  const lang = language || detectLanguage(topic);
  let results = await searchKnowledge(topic, null, lang === 'en' ? null : lang);

  if (tankSize) {
    const filtered = results.filter(r =>
      r.content.toLowerCase().includes(String(tankSize).toLowerCase()) ||
      !r.content.toLowerCase().includes('tank')
    );
    if (filtered.length > 0) results = filtered;
  }

  if (experience === 'beginner') {
    const filtered = results.filter(r =>
      r.content.toLowerCase().includes('beginner') ||
      r.content.toLowerCase().includes('easy') ||
      !r.content.toLowerCase().includes('advanced')
    );
    if (filtered.length > 0) results = filtered;
  }

  return {
    topic,
    language: lang,
    advice: results.map(r => ({
      title: r.title,
      category: r.category,
      content: r.content.substring(0, 900) + (r.content.length > 900 ? '...' : ''),
      source: r.source,
      language: r.language
    })),
    totalResults: results.length
  };
}

async function addKnowledgeDocument({ title, category, content, source, language = 'en' }) {
  const result = await query(
    `INSERT INTO knowledge_documents (title, category, content, source, language)
     VALUES (?, ?, ?, ?, ?)`,
    [title, category, content, source, language]
  );
  return result.insertId;
}

async function logUnknownQuestion({ conversationId, question, language, intent, missingInformation, attemptedAnswer, confidence }) {
  const result = await query(
    `INSERT INTO unknown_questions
       (conversation_id, question, language, intent, missing_information, attempted_answer, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      conversationId || null,
      question,
      language || null,
      intent || null,
      Array.isArray(missingInformation) ? JSON.stringify(missingInformation) : (missingInformation || null),
      attemptedAnswer || null,
      confidence || 'low'
    ]
  );
  return { id: result.insertId, logged: true };
}

module.exports = { searchKnowledge, getAdvice, addKnowledgeDocument, logUnknownQuestion, detectLanguage };

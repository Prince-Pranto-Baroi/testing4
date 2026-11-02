// Loads the aquarium knowledge pack (English) and the bilingual pack (English + Bangla) into knowledge_documents.
// Safe to run on every start: documents are matched by title and updated, never duplicated.
const { query } = require('./db');
const pack = require('./data/knowledge-pack-v2.json');
const bilingual = require('./data/bilingual-aquarium-knowledge.json');

const CATEGORY_MAP = { plants: 'plant care', lighting: 'plant care', fertilizer: 'plant care', plant_placement: 'aquascaping', plant_health: 'plant problems', fish: 'fish care', stocking: 'fish care',
  water_quality: 'water parameters', water_treatment: 'water parameters', water_problems: 'plant problems', fish_diseases: 'fish diseases', emergency: 'fish diseases', prevention: 'fish care',
  maintenance: 'maintenance', safety: 'fish diseases', fish_care: 'feeding breeding', calculations: 'aquarium setup', ai_instructions: 'foundation' };

function documents() {
  const docs = (Array.isArray(pack) ? pack : pack.documents || []).map(d => ({ title: String(d.title).slice(0, 190), category: d.category || 'foundation', content: d.content, source: d.source || 'Aquarium Knowledge Pack v2', language: d.language || 'en' }));
  for (const r of bilingual.records || []) {
    const category = CATEGORY_MAP[r.category] || r.category || 'foundation';
    for (const [sfx, lang] of [['EN', 'en'], ['BN', 'bn']]) {
      const l = lang;
      const content = [`Question: ${r['question_' + l] || ''}`, `Answer: ${r['answer_' + l] || ''}`, `Keywords: ${(r.keywords || []).join(', ')}`,
        `Related English question: ${r.question_en || ''}`, `Related Bangla question: ${r.question_bn || ''}`, `Sources: ${(r.source_urls || []).join(' | ')}`].filter(Boolean).join('\n\n');
      docs.push({ title: `[Bilingual KB ${sfx}] ${r['title_' + l] || r.id}`.slice(0, 190), category, content, source: 'Bilingual Aquarium Knowledge Base v1', language: lang });
    }
  }
  return docs;
}

async function seed() {
  const docs = documents(), [{ n }] = await query('SELECT COUNT(*) AS n FROM knowledge_documents');
  if (Number(n) >= docs.length) return { added: 0, total: Number(n) };      // already loaded
  let added = 0;
  for (const d of docs) {
    const hit = await query('SELECT id FROM knowledge_documents WHERE title = ?', [d.title]);
    if (hit.length) await query('UPDATE knowledge_documents SET category = ?, content = ?, source = ?, language = ? WHERE id = ?', [d.category, d.content, d.source, d.language, hit[0].id]);
    else { await query('INSERT INTO knowledge_documents (title, category, content, source, language) VALUES (?,?,?,?,?)', [d.title, d.category, d.content, d.source, d.language]); added++; }
  }
  return { added, total: docs.length };
}
module.exports = { seed, documents };

// Chat orchestrator for AquaLuxe. Same per-turn pipeline as the Aquarium AI Beast project
// (classify the CURRENT message -> retrieve + validate knowledge -> model with tools -> validate answer),
// but wired to AquaLuxe's database, guest sessions (no accounts) and read-only store tools.
const { query } = require('./db');
const tools = require('./tools');
const { getProvider } = require('./providers');
const { buildSystemPrompt } = require('./systemPrompt');
const { runGroundingPipeline, log, DEBUG } = require('./nlu/groundingPipeline');
const { validateAnswer, softenCertainty } = require('./nlu/answerValidator');

const FALLBACK = 'Sorry, I could not reach the assistant just now. Please try again in a moment, or contact us on WhatsApp.';

function groundingNote({ classification, category, grounding }, prev) {
  const L = ['## CURRENT TURN CONTEXT (auto-detected from the CURRENT message only - authoritative, do not override with older topics)',
    `Detected intent: ${classification.intent}${classification.subIntent ? ` (${classification.subIntent})` : ''} - confidence: ${classification.confidence}`];
  if (classification.entities.livestock.length || classification.entities.parameter) L.push(`Detected entities: livestock=${classification.entities.livestock.join(', ') || 'none'}; parameter=${classification.entities.parameter || 'none'}`);
  if (prev && prev.intent && prev.intent !== classification.intent) L.push(`The PREVIOUS turn's topic was "${prev.intent}" - that topic is now closed. Answer ONLY the current "${classification.intent}" question unless the user's wording explicitly refers back to it.`);
  if (grounding.acceptable && grounding.filtered.length) {
    L.push('\nRelevant knowledge base results for the CURRENT question (use as grounding; you may add your own expertise):');
    grounding.filtered.slice(0, 3).forEach((r, i) => L.push(`[${i + 1}] ${r.title} (category: ${r.category})\n${r.content.slice(0, 700)}`));
    L.push('\nDo not call logUnknownQuestion this turn unless you genuinely cannot give a safe answer.');
  } else if (category) L.push(`\nNo sufficiently relevant knowledge base entry was found for this "${category}" question. Answer from your own aquarium expertise if you can do so confidently; ask targeted clarifying questions if the answer depends on missing details; only call logUnknownQuestion if you truly cannot help safely.`);
  else L.push('\nThis looks like a shopping/support or general request - use the store tools as needed.');
  return L.join('\n');
}

let storeCache = { at: 0, v: {} };
async function storeFacts(siteUrl) {
  if (Date.now() - storeCache.at > 60000) { try { const S = Object.fromEntries((await query('SELECT k, v FROM settings')).map(r => [r.k, r.v])); storeCache = { at: Date.now(), v: S }; } catch (e) {} }
  return { name: storeCache.v.store_name, siteUrl };
}

// Returns the conversation id for this visitor. A conversation is only reused when the browser proves it owns it (session id).
async function getConversation(conversationId, sessionId) {
  if (conversationId) { const r = await query('SELECT id FROM chat_conversations WHERE id = ? AND session_id = ?', [conversationId, sessionId]); if (r.length) return r[0].id; }
  return (await query('INSERT INTO chat_conversations (session_id) VALUES (?)', [sessionId])).insertId;
}

async function processMessage({ message, sessionId, conversationId, siteUrl }) {
  conversationId = await getConversation(conversationId, sessionId);
  let prev = null;
  try { const r = await query('SELECT last_intent_context FROM chat_conversations WHERE id = ?', [conversationId]); if (r[0] && r[0].last_intent_context) prev = JSON.parse(r[0].last_intent_context); } catch (e) { log('PREVIOUS_CONTEXT_LOAD_ERROR', e.message); }

  await query('INSERT INTO chat_messages (conversation_id, role, content) VALUES (?,?,?)', [conversationId, 'user', message]);
  let rows = await query("SELECT role, content FROM chat_messages WHERE conversation_id = ? AND role IN ('user','assistant') ORDER BY id DESC LIMIT 11", [conversationId]);
  let history = rows.reverse().slice(0, -1);
  while (history.length && history[0].role !== 'user') history.shift();       // providers need the first turn to be the user's

  let pipe;
  try { pipe = await runGroundingPipeline(message, prev); }
  catch (e) { log('GROUNDING_PIPELINE_ERROR', e.message); pipe = { classification: { intent: 'UNKNOWN', subIntent: null, entities: { livestock: [], parameter: null }, language: 'en', confidence: 'low', usedPreviousContext: false }, searchQuery: message, category: null, grounding: { acceptable: false, semanticScore: 0, filtered: [] } }; }

  const systemPrompt = buildSystemPrompt(await storeFacts(siteUrl)) + '\n\n' + groundingNote(pipe, prev);
  const cards = new Map(), context = { conversationId, siteUrl, cards, pipeline: pipe };
  let answer = '', toolCalls = [];
  try {
    const provider = getProvider(), run = sp => provider.runAgentTurn({ systemPrompt: sp, history, message, toolDefinitions: tools.getToolDefinitions(), executeTool: tools.executeTool, context });
    const first = await run(systemPrompt);
    answer = first.content || "Sorry, I couldn't come up with an answer for that - could you rephrase?"; toolCalls = first.toolCalls || [];
    let v = validateAnswer({ intent: pipe.classification.intent, answer, previousIntent: prev && prev.intent });
    if (!v.pass && v.reasons.includes('unsupported_certainty') && !v.reasons.includes('topic_mismatch_disease_leak')) { answer = softenCertainty(answer); v = validateAnswer({ intent: pipe.classification.intent, answer }); }
    if (!v.pass && v.reasons.includes('topic_mismatch_disease_leak')) {
      const retry = await run(systemPrompt + `\n\nIMPORTANT CORRECTION: your previous draft wrongly discussed a different topic. The user's CURRENT question is about "${pipe.classification.intent}". Discard that draft and answer ONLY the current question.`);
      const rv = validateAnswer({ intent: pipe.classification.intent, answer: retry.content || '' });
      if (rv.pass && (retry.content || '').trim()) { answer = retry.content; toolCalls = retry.toolCalls || []; }
      else { answer = `Sorry, I mixed that up with an earlier topic. Could you ask your question again with a few more details? It looks like you're asking about ${pipe.classification.intent.replace(/_/g, ' ').toLowerCase()}.`; toolCalls = []; cards.clear(); }
    }
  } catch (e) { console.error('AI chat error:', e.message); answer = FALLBACK; cards.clear(); }      // details stay in the server log, never shown to visitors

  await query('INSERT INTO chat_messages (conversation_id, role, content, tool_calls) VALUES (?,?,?,?)', [conversationId, 'assistant', answer, toolCalls.length ? JSON.stringify(toolCalls.map(t => t.name)) : null]);
  try { await query('UPDATE chat_conversations SET last_intent_context = ? WHERE id = ?', [JSON.stringify({ intent: pipe.classification.intent, subIntent: pipe.classification.subIntent, entities: pipe.classification.entities }), conversationId]); } catch (e) {}
  if (DEBUG) log('TURN_SUMMARY', { intent: pipe.classification.intent, category: pipe.category, relevance: pipe.grounding.semanticScore, tools: toolCalls.map(t => t.name) });
  return { response: answer, conversationId, products: [...cards.values()].slice(0, 4) };
}
module.exports = { processMessage };

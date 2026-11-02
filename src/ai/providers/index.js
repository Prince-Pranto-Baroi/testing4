// Chooses how questions are answered:
//  - AI_API_KEY set  -> real AI (anthropic | openai | azure | any OpenAI-compatible service via AI_BASE_URL); if that call fails, falls back to no-AI mode
//  - no key / 'local' -> no-AI mode (providers/offline.js): free, no account, answers from your shop data + knowledge base
const offline = require('./offline');

function getProvider() {
  const name = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  if (!process.env.AI_API_KEY || name === 'local' || name === 'offline') return offline;
  const real = name === 'anthropic' ? require('./anthropic') : require('./openai');
  return {
    async runAgentTurn(args) {
      try { const r = await real.runAgentTurn(args); if ((r.content || '').trim()) return r; }
      catch (e) { console.error('AI service failed, answering in no-AI mode instead:', e.message); }
      if (args.context && args.context.cards) args.context.cards.clear();
      return offline.runAgentTurn(args);
    }
  };
}
module.exports = { getProvider };

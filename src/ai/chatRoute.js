// Chat HTTP endpoints: public /api/chat (guests, rate limited) and admin review of what the bot could not answer.
const cfg = require('../config');
const { query } = require('./db');
const orchestrator = require('./orchestrator');

const hits = new Map(); let day = { d: '', n: 0 };
function limited(ip) {                    // protects your AI bill: per-visitor and whole-site limits
  const now = Date.now(), today = new Date().toISOString().slice(0, 10);
  if (day.d !== today) day = { d: today, n: 0 };
  if (day.n >= cfg.ai.dailyCap) return 'Our assistant has reached its daily limit. Please contact us on WhatsApp or try again tomorrow.';
  const a = (hits.get(ip) || []).filter(t => now - t < 864e5);
  if (a.filter(t => now - t < 6e4).length >= cfg.ai.perMinute) return 'You are sending messages very quickly. Please wait a minute and try again.';
  if (a.length >= cfg.ai.perDay) return 'You have reached the daily chat limit. Please contact us on WhatsApp for more help.';
  a.push(now); hits.set(ip, a); day.n++; if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < 864e5)) hits.delete(k);
  return null;
}

function publicRoutes(app, wrap) {
  app.post('/api/chat', wrap(async (req, res) => {
    const message = String(req.body.message || '').trim(), sid = String(req.body.sid || '');
    if (!message) return res.status(400).json({ error: 'Please type a message.' });
    if (message.length > 800) return res.status(400).json({ error: 'Message is too long (max 800 characters).' });
    if (!/^[a-zA-Z0-9-]{16,64}$/.test(sid)) return res.status(400).json({ error: 'Invalid chat session.' });
    const wait = limited(req.ip); if (wait) return res.status(429).json({ error: wait });
    const siteUrl = cfg.siteUrl || `${req.protocol}://${req.get('host')}`;
    const r = await orchestrator.processMessage({ message, sessionId: sid, conversationId: parseInt(req.body.conversationId) || null, siteUrl });
    res.json({ response: r.response, conversationId: r.conversationId, products: r.products });   // nothing else ever leaves the server
  }));
}

function adminRoutes(admin, wrap) {
  admin.get('/chat/summary', wrap(async (req, res) => {
    const [c] = await query("SELECT COUNT(*) AS n FROM chat_conversations WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
    const [m] = await query("SELECT COUNT(*) AS n FROM chat_messages WHERE role = 'user' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
    const [k] = await query('SELECT COUNT(*) AS n FROM knowledge_documents');
    const unknown = await query('SELECT id, question, language, intent, attempted_answer, human_review_needed, created_at FROM unknown_questions ORDER BY human_review_needed DESC, id DESC LIMIT 100');
    res.json({ enabled: cfg.ai.enabled, mode: cfg.ai.enabled ? 'ai' : 'offline', provider: cfg.ai.provider, conversations30: Number(c.n), messages30: Number(m.n), documents: Number(k.n), unknown });
  }));
  admin.patch('/chat/unknown/:id', wrap(async (req, res) => { await query('UPDATE unknown_questions SET human_review_needed = ? WHERE id = ?', [req.body.reviewed ? 0 : 1, parseInt(req.params.id) || 0]); res.json({ success: true }); }));
}
module.exports = { publicRoutes, adminRoutes };

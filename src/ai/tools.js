// What the chat assistant is allowed to do. Everything here is READ-ONLY and reads AquaLuxe's own database,
// so answers about products, prices, stock, delivery and orders come from the live store, not from guesses.
// Deliberately NOT available to the AI: customer lists, cost prices, admin data, creating orders or payments.
const { query } = require('./db');
const { calcPayment, phoneKey } = require('../payment');
const knowledge = require('./knowledgeService');

const tools = {};
const reg = (name, description, properties, required, handler) => { tools[name] = { definition: { name, description, parameters: { type: 'object', properties, required } }, handler }; };
const getToolDefinitions = () => Object.values(tools).map(t => t.definition);
async function executeTool(name, args, context) {
  const t = tools[name]; if (!t) throw new Error('Unknown tool: ' + name);
  for (const r of t.definition.parameters.required || []) if (args[r] === undefined || args[r] === null || args[r] === '') throw new Error('Missing required argument: ' + r);
  return t.handler(args || {}, context || {});
}

const STOP = new Set(['the', 'for', 'and', 'with', 'any', 'you', 'have', 'got', 'need', 'want', 'buy', 'price', 'how', 'much', 'show', 'me', 'can', 'what', 'which', 'good', 'best', 'cheap', 'some', 'your', 'are', 'there']);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const base = ctx => (ctx.siteUrl || '').replace(/\/$/, '');
const COLS = 'p.id, p.name, p.price, p.old_price, p.stock, p.description, p.how_to_use, p.image, p.is_featured, c.name AS category, c.slug AS category_slug, c.icon AS category_icon';

function card(p, ctx) {   // public product info only
  return { id: p.id, name: p.name, category: p.category, price: num(p.price), old_price: p.old_price ? num(p.old_price) : null, in_stock: p.stock > 0,
    stock_note: p.stock <= 0 ? 'out of stock' : p.stock <= 5 ? `only ${p.stock} left` : 'in stock', url: `${base(ctx)}/product.html?id=${p.id}`, image: p.image || null, icon: p.category_icon || '🐟' };
}
function remember(ctx, products) { if (ctx.cards) for (const p of products) if (!ctx.cards.has(p.id)) ctx.cards.set(p.id, { id: p.id, name: p.name, price: num(p.price), old_price: p.old_price ? num(p.old_price) : null, image: p.image || null, stock: p.stock, category_icon: p.category_icon || '🐟', category: p.category }); }

reg('searchProducts', 'Search the AquaLuxe catalog by product keywords (use simple English product words like "neon tetra", "driftwood", "LED light", "filter"), optional category slug and price range. Returns real prices and stock. Always use this before naming a product, price or availability.',
  { query: { type: 'string', description: 'Product keywords' }, category: { type: 'string', description: 'Category slug or name, e.g. aquatic-plants, fish-food' }, minPrice: { type: 'number' }, maxPrice: { type: 'number' }, inStockOnly: { type: 'boolean' }, limit: { type: 'number', description: 'Max results (default 6, max 10)' } }, [],
  async (a, ctx) => {
    const where = ['p.is_active = 1'], params = [];
    if (a.category) { where.push('(c.slug = ? OR c.name LIKE ?)'); params.push(String(a.category).toLowerCase(), `%${a.category}%`); }
    const words = String(a.query || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 2 && !STOP.has(w)).slice(0, 6);
    if (words.length) { where.push('(' + words.map(() => '(p.name LIKE ? OR p.description LIKE ? OR c.name LIKE ?)').join(' OR ') + ')'); for (const w of words) params.push(`%${w}%`, `%${w}%`, `%${w}%`); }
    if (a.minPrice > 0) { where.push('p.price >= ?'); params.push(num(a.minPrice)); }
    if (a.maxPrice > 0) { where.push('p.price <= ?'); params.push(num(a.maxPrice)); }
    if (a.inStockOnly) where.push('p.stock > 0');
    let rows = await query(`SELECT ${COLS} FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${where.join(' AND ')} LIMIT 60`, params);
    const score = p => words.reduce((s, w) => s + (p.name.toLowerCase().includes(w) ? 3 : 0) + ((p.description || '').toLowerCase().includes(w) ? 1 : 0), 0) + (p.stock > 0 ? 1 : 0) + (p.is_featured ? .5 : 0);
    rows = rows.sort((x, y) => score(y) - score(x)).slice(0, Math.min(Math.max(1, num(a.limit, 6)), 10));
    remember(ctx, rows);
    return { count: rows.length, products: rows.map(p => ({ ...card(p, ctx), summary: String(p.description || '').slice(0, 160) })), note: rows.length ? undefined : 'No matching products. Say so honestly; you may suggest browsing the shop link.' };
  });

reg('getProduct', 'Get full details of one product by id: description, how to use/care, price, stock and page link.', { productId: { type: 'number' } }, ['productId'],
  async (a, ctx) => {
    const [p] = await query(`SELECT ${COLS} FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ? AND p.is_active = 1`, [Math.trunc(num(a.productId))]);
    if (!p) throw new Error('Product not found');
    remember(ctx, [p]); return { ...card(p, ctx), description: String(p.description || '').slice(0, 700), how_to_use: String(p.how_to_use || '').slice(0, 500) };
  });

reg('checkProductStock', 'Check whether a product has enough stock for a quantity.', { productId: { type: 'number' }, quantity: { type: 'number' } }, ['productId', 'quantity'],
  async a => { const [p] = await query('SELECT id, name, stock FROM products WHERE id = ? AND is_active = 1', [Math.trunc(num(a.productId))]); if (!p) throw new Error('Product not found');
    const q = Math.max(1, Math.trunc(num(a.quantity, 1))); return { name: p.name, requested: q, available: p.stock >= q, in_stock_now: Math.max(0, p.stock) }; });

reg('listCategories', 'List all shop categories with how many products each has.', {}, [],
  async (a, ctx) => ({ categories: (await query(`SELECT c.name, c.slug, c.icon, COUNT(p.id) AS products FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1 GROUP BY c.id, c.name, c.slug, c.icon ORDER BY c.sort_order`)).map(c => ({ name: c.name, slug: c.slug, products: Number(c.products), url: `${base(ctx)}/shop.html?category=${c.slug}` })) }));

reg('getStoreInfo', 'Store contact details, opening hours, delivery charges, payment rules and key website links. Use for any question about contact, delivery, payment, advance, returns/ordering process.', {}, [],
  async (a, ctx) => {
    const S = Object.fromEntries((await query('SELECT k, v FROM settings')).map(r => [r.k, r.v])), cfg = require('../config').delivery, b = base(ctx);
    return { store_name: S.store_name, phone: S.phone, whatsapp: S.whatsapp ? `https://wa.me/${S.whatsapp}` : null, email: S.email, address: S.address, hours: 'Every day, 10:00 AM - 9:00 PM', announcement: S.announcement,
      delivery: { inside_dhaka: `৳${cfg.insideDhaka} (district Dhaka)`, outside_dhaka: `৳${cfg.outsideDhaka} (all other districts)`, time: 'Dhaka 1-2 working days, outside Dhaka 2-4 working days' },
      payment_rules: { inside_dhaka: `Pay the ৳${cfg.insideDhaka} delivery charge in advance by bKash/Nagad; the product total is paid in cash on delivery.`, outside_dhaka: `Pay ${cfg.outsideAdvanceRate * 100}% of the product total in advance by bKash/Nagad; the remaining ${cfg.outsideAdvanceRate * 100}% plus ৳${cfg.outsideDhaka} delivery is paid in cash on delivery.`, methods: 'bKash, Nagad (advance); cash on delivery (balance)' },
      ordering: 'Customers order on the website without an account. After ordering they pay the advance and can enter the bKash/Nagad Transaction ID on the confirmation page. The team phones to confirm before shipping.',
      links: { website: b || null, shop: `${b}/shop.html`, track_order: `${b}/track.html`, contact: `${b}/contact.html`, about: `${b}/about.html`, aquascapes: `${b}/aquascapes.html`, checkout: `${b}/checkout.html` } };
  });

reg('calculateOrderCost', 'Calculate delivery charge, total, advance payment and cash-on-delivery balance. Pass items (productId + quantity) or a subtotal, and the delivery district (Dhaka = inside Dhaka, anything else = outside).',
  { district: { type: 'string', description: 'District name, e.g. Dhaka, Gazipur, Sylhet' }, items: { type: 'array', items: { type: 'object', properties: { productId: { type: 'number' }, quantity: { type: 'number' } } } }, subtotal: { type: 'number' } }, ['district'],
  async a => {
    let subtotal = num(a.subtotal), lines = [];
    if (Array.isArray(a.items) && a.items.length) {
      subtotal = 0;
      for (const it of a.items.slice(0, 30)) { const [p] = await query('SELECT id, name, price, stock FROM products WHERE id = ? AND is_active = 1', [Math.trunc(num(it.productId))]); if (!p) throw new Error('A product was not found');
        const q = Math.max(1, Math.min(99, Math.trunc(num(it.quantity, 1)))); subtotal += num(p.price) * q; lines.push({ name: p.name, quantity: q, line_total: num(p.price) * q, enough_stock: p.stock >= q }); }
    }
    if (!(subtotal > 0)) throw new Error('Need items or a subtotal greater than 0');
    const r = calcPayment(subtotal, a.district);
    return { district: a.district, area: r.zone === 'inside_dhaka' ? 'Inside Dhaka' : 'Outside Dhaka', items: lines, product_subtotal: r.subtotal, delivery_charge: r.shipping, total: r.total, advance_to_pay_now: r.advance, balance_cash_on_delivery: r.balance };
  });

reg('trackOrder', 'Look up an order status. Requires BOTH the order number (like AL261026-1234) and the phone number used for the order. Never reveal anything about orders without both.', { orderNo: { type: 'string' }, phone: { type: 'string' } }, ['orderNo', 'phone'],
  async a => {
    const no = String(a.orderNo).trim().toUpperCase(), ph = phoneKey(a.phone);
    const [o] = await query('SELECT * FROM orders WHERE order_no = ?', [no]);
    if (!o || ph.length < 8 || phoneKey(o.customer_phone) !== ph) return { found: false, message: 'No order found. Ask the customer to check the order number and phone number.' };
    const items = await query('SELECT product_name, qty FROM order_items WHERE order_id = ?', [o.id]);
    return { found: true, order_no: o.order_no, status: o.status, placed: o.created_at, items: items.map(i => `${i.product_name} x${i.qty}`), subtotal: o.subtotal, delivery: o.shipping, total: o.total,
      advance_required: o.delivery_zone ? o.advance_amount : null, advance_status: o.delivery_zone ? o.advance_status : null, balance_on_delivery: o.delivery_zone ? o.balance_due : null };
  });

reg('searchKnowledge', "Search the aquarium knowledge base (fish diseases, water parameters, cycling, species care, plants, compatibility, breeding, shrimp, aquascaping). Works in English, Bangla and Banglish - pass the user's own wording.",
  { query: { type: 'string' }, category: { type: 'string', description: "Optional, e.g. 'fish diseases', 'water parameters', 'plant care'" }, language: { type: 'string', description: "'en', 'bn' or 'bn-latn'" } }, ['query'],
  a => knowledge.searchKnowledge(a.query, a.category, a.language));

reg('getAquariumAdvice', 'Structured care advice on a broad topic (cycling a new tank, shrimp care, cloudy water).', { topic: { type: 'string' }, tankSize: { type: 'string' }, experience: { type: 'string' }, language: { type: 'string' } }, ['topic'],
  a => knowledge.getAdvice(a));

reg('logUnknownQuestion', 'Log a question you genuinely cannot answer safely so the shop owner can review it. Not for routine questions.', { question: { type: 'string' }, language: { type: 'string' }, intent: { type: 'string' }, missingInformation: { type: 'array', items: { type: 'string' } }, attemptedAnswer: { type: 'string' }, confidence: { type: 'string' } }, ['question'],
  (a, ctx) => knowledge.logUnknownQuestion({ conversationId: ctx.conversationId, ...a }));

module.exports = { getToolDefinitions, executeTool };

// AquaLuxe - server.js  (Customer website: /   |   Admin panel: /admin)
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cfg = require('./src/config');
const db = require('./src/db');
const { calcPayment, phoneKey } = require('./src/payment');
const chat = require('./src/ai/chatRoute');

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', 1);   // set TRUST_PROXY=1 when behind Nginx so visitor IPs are correct for rate limits
app.use(express.json({ limit: '200kb' }));
app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); if (req.path.startsWith('/admin')) res.set('X-Frame-Options', 'DENY'); next(); });

const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
app.use('/admin', express.static(path.join(__dirname, 'admin')));   // separate admin panel
app.use(express.static(path.join(__dirname, 'public')));            // customer website

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype) ? cb(null, true) : cb(Object.assign(new Error('Only JPG, PNG, WEBP or GIF pictures are allowed.'), { status: 400 }))
});

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);
const q = (sql, params) => db.getPool().query(sql, params).then(r => r[0]);
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const int = (v, d = 0) => Math.trunc(num(v, d));
const removeUpload = img => { if (img && img.startsWith('/uploads/')) fs.unlink(path.join(UPLOAD_DIR, path.basename(img)), () => {}); };

// ───────────────────────── PUBLIC API (customer website) ─────────────────────────
const PRODUCT_COLS = `p.id, p.name, p.price, p.old_price, p.stock, p.description, p.how_to_use, p.image, p.is_featured, p.created_at,
  c.name AS category, c.slug AS category_slug, c.icon AS category_icon`;

app.get('/api/settings', wrap(async (req, res) => {
  const rows = await q('SELECT k, v FROM settings');
  res.json({ ...Object.fromEntries(rows.map(r => [r.k, r.v])), delivery_inside_dhaka: cfg.delivery.insideDhaka, delivery_outside_dhaka: cfg.delivery.outsideDhaka, chat_enabled: true, chat_mode: cfg.ai.enabled ? 'ai' : 'offline' });
}));

app.get('/api/categories', wrap(async (req, res) => {
  res.json(await q(`SELECT c.id, c.name, c.slug, c.icon, COUNT(p.id) AS count
    FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
    GROUP BY c.id ORDER BY c.sort_order`));
}));

app.get('/api/products', wrap(async (req, res) => {
  const where = ['p.is_active = 1'], params = [];
  if (req.query.category) { where.push('c.slug = ?'); params.push(String(req.query.category)); }
  if (req.query.q) { where.push('(p.name LIKE ? OR p.description LIKE ?)'); const s = '%' + String(req.query.q).slice(0, 60) + '%'; params.push(s, s); }
  if (req.query.min) { where.push('p.price >= ?'); params.push(num(req.query.min)); }
  if (req.query.max) { where.push('p.price <= ?'); params.push(num(req.query.max)); }
  if (req.query.featured) where.push('p.is_featured = 1');
  if (req.query.instock) where.push('p.stock > 0');
  const order = { price_asc: 'p.price ASC', price_desc: 'p.price DESC', newest: 'p.id DESC', name: 'p.name ASC' }[req.query.sort] || 'p.sort_order ASC, p.id DESC';
  const limit = Math.min(int(req.query.limit, 100) || 100, 200);
  res.json(await q(`SELECT ${PRODUCT_COLS} FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ${limit}`, params));
}));

app.get('/api/products/:id', wrap(async (req, res) => {
  const rows = await q(`SELECT ${PRODUCT_COLS} FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ? AND p.is_active = 1`, [int(req.params.id)]);
  if (!rows.length) return res.status(404).json({ error: 'Product not found' });
  res.json(rows[0]);
}));

app.post('/api/orders', wrap(async (req, res) => {
  const c = req.body.customer || {}, items = Array.isArray(req.body.items) ? req.body.items : [];
  const name = String(c.name || '').trim(), phone = String(c.phone || '').trim(), address = String(c.address || '').trim();
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
  if (!/^[+\d][\d\s-]{8,16}$/.test(phone)) return res.status(400).json({ error: 'Please enter a valid phone number.' });
  if (address.length < 6) return res.status(400).json({ error: 'Please enter your full delivery address.' });
  if (!items.length || items.length > 50) return res.status(400).json({ error: 'Your cart is empty.' });
  const district = String(c.district || '').trim().slice(0, 80);
  if (!district) return res.status(400).json({ error: 'Please select your district.' });
  // An advance is required on every order, so it is paid by bKash or Nagad (the remaining balance is paid on delivery)
  if (!['bkash', 'nagad'].includes(c.payment_method)) return res.status(400).json({ error: 'Please choose bKash or Nagad to pay the advance.' });
  const payment = c.payment_method;
  const trx = String(c.trx_id || '').trim().replace(/[^\w-]/g, '').slice(0, 40) || null;
  const notes = String(c.notes || '').trim().slice(0, 500);

  const conn = await db.getPool().getConnection();
  try {
    await conn.beginTransaction();
    const lines = []; let subtotal = 0;
    for (const it of items) {
      const qty = int(it.qty);
      if (qty < 1 || qty > 99) throw Object.assign(new Error('Invalid quantity.'), { status: 400 });
      const [[p]] = await conn.query('SELECT id, name, price, cost_price, stock FROM products WHERE id = ? AND is_active = 1 FOR UPDATE', [int(it.id)]);
      if (!p) throw Object.assign(new Error('A product in your cart is no longer available.'), { status: 400 });
      if (p.stock < qty) throw Object.assign(new Error(`Sorry, only ${p.stock} left of "${p.name}".`), { status: 409 });
      lines.push({ p, qty }); subtotal += p.price * qty;
    }
    // All money values are calculated here from database prices. Totals or advances sent by the browser are ignored.
    const pay = calcPayment(subtotal, district), shipping = pay.shipping, total = pay.total;
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    const orderNo = 'AL' + String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + crypto.randomInt(1000, 9999);
    const [r] = await conn.query(
      'INSERT INTO orders (order_no, customer_name, customer_phone, customer_email, customer_address, district, payment_method, notes, subtotal, shipping, total, delivery_zone, advance_amount, balance_due, advance_status, advance_trx) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [orderNo, name.slice(0, 160), phone, String(c.email || '').slice(0, 160) || null, address.slice(0, 600), district, payment, notes || null, subtotal, shipping, total, pay.zone, pay.advance, pay.balance, trx ? 'submitted' : 'unpaid', trx]);
    // a customer who orders again comes back out of the archive
    await conn.query('DELETE FROM archived_customers WHERE phone_key = ?', [phoneKey(phone)]);
    for (const { p, qty } of lines) {
      await conn.query('INSERT INTO order_items (order_id, product_id, product_name, price, cost, qty) VALUES (?,?,?,?,?,?)', [r.insertId, p.id, p.name, p.price, p.cost_price, qty]);
      await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [qty, p.id]);
    }
    await conn.commit();
    res.json({ success: true, order_no: orderNo, zone: pay.zone, district, payment_method: payment, subtotal: pay.subtotal, shipping, total, advance: pay.advance, balance: pay.balance, advance_status: trx ? 'submitted' : 'unpaid' });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

app.get('/api/orders/track', wrap(async (req, res) => {
  const no = String(req.query.order_no || '').trim().toUpperCase(), phone = String(req.query.phone || '').replace(/\D/g, '');
  const [o] = await q('SELECT * FROM orders WHERE order_no = ?', [no]);
  if (!o || phone.length < 6 || o.customer_phone.replace(/\D/g, '').slice(-10) !== phone.slice(-10)) return res.status(404).json({ error: 'No order found. Check your order number and phone.' });
  const items = await q('SELECT product_name, price, qty FROM order_items WHERE order_id = ?', [o.id]);
  res.json({ order_no: o.order_no, status: o.status, created_at: o.created_at, subtotal: o.subtotal, shipping: o.shipping, total: o.total, payment_method: o.payment_method,
    zone: o.delivery_zone, district: o.district, advance: o.advance_amount, balance: o.balance_due, advance_status: o.advance_status, items });
}));

// Customer sends the bKash/Nagad Transaction ID for the advance. This only records it as "submitted"; the owner verifies it in Admin.
app.post('/api/orders/trx', wrap(async (req, res) => {
  const no = String(req.body.order_no || '').trim().toUpperCase(), phone = String(req.body.phone || '').replace(/\D/g, '');
  const trx = String(req.body.trx_id || '').trim().replace(/[^\w-]/g, '').slice(0, 40);
  if (trx.length < 4) return res.status(400).json({ error: 'Please enter the Transaction ID from your bKash/Nagad message.' });
  const [o] = await q('SELECT id, customer_phone, advance_status FROM orders WHERE order_no = ?', [no]);
  if (!o || phone.length < 6 || o.customer_phone.replace(/\D/g, '').slice(-10) !== phone.slice(-10)) return res.status(404).json({ error: 'Order not found.' });
  if (o.advance_status === 'verified') return res.status(409).json({ error: 'Your advance payment is already verified. Thank you!' });
  await q("UPDATE orders SET advance_trx = ?, advance_status = 'submitted' WHERE id = ?", [trx, o.id]);
  res.json({ success: true, advance_status: 'submitted' });
}));

app.post('/api/contact', wrap(async (req, res) => {
  const { name, contact, message } = req.body;
  if (!name || !contact || !message || String(message).length < 3) return res.status(400).json({ error: 'Please fill in all fields.' });
  await q('INSERT INTO messages (name, contact, message) VALUES (?,?,?)', [String(name).slice(0, 160), String(contact).slice(0, 160), String(message).slice(0, 2000)]);
  res.json({ success: true });
}));

chat.publicRoutes(app, wrap);

// ───────────────────────── ADMIN AUTH ─────────────────────────
const sessions = new Map();      // token -> { id, name, username, exp }
const attempts = new Map();      // ip -> { n, until }
const SESSION_MS = 12 * 60 * 60 * 1000;

app.post('/api/admin/login', wrap(async (req, res) => {
  const ip = req.ip, a = attempts.get(ip) || { n: 0, until: 0 };
  if (a.until > Date.now()) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes.' });
  const [u] = await q('SELECT * FROM admin_users WHERE username = ?', [String(req.body.username || '')]);
  if (!u || !db.verifyPassword(String(req.body.password || ''), u.password_hash)) {
    a.n++; if (a.n >= 6) { a.until = Date.now() + 10 * 60 * 1000; a.n = 0; } attempts.set(ip, a);
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  attempts.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { id: u.id, name: u.name, username: u.username, exp: Date.now() + SESSION_MS });
  res.json({ success: true, token, name: u.name });
}));

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const s = sessions.get(token);
  if (!s || s.exp < Date.now()) { sessions.delete(token); return res.status(401).json({ error: 'Please log in again.' }); }
  req.admin = s; req.token = token; next();
}
const admin = express.Router();
admin.use(requireAdmin);
app.use('/api/admin', admin);

chat.adminRoutes(admin, wrap);
admin.get('/me', (req, res) => res.json({ name: req.admin.name, username: req.admin.username }));
admin.post('/logout', (req, res) => { sessions.delete(req.token); res.json({ success: true }); });
admin.post('/change-password', wrap(async (req, res) => {
  const { current, next: np } = req.body;
  const [u] = await q('SELECT * FROM admin_users WHERE id = ?', [req.admin.id]);
  if (!db.verifyPassword(String(current || ''), u.password_hash)) return res.status(400).json({ error: 'Current password is wrong.' });
  if (String(np || '').length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  await q('UPDATE admin_users SET password_hash = ? WHERE id = ?', [db.hashPassword(np), req.admin.id]);
  res.json({ success: true });
}));

// ───────────────────────── ADMIN: PRODUCTS ─────────────────────────
const productFields = b => ({
  name: String(b.name || '').trim().slice(0, 255), category_id: int(b.category_id) || null,
  price: Math.max(0, num(b.price)), old_price: num(b.old_price) > 0 ? num(b.old_price) : null, cost_price: Math.max(0, num(b.cost_price)),
  stock: Math.max(0, int(b.stock)), low_stock_alert: Math.max(0, int(b.low_stock_alert, 5)),
  description: String(b.description || '').slice(0, 5000), how_to_use: String(b.how_to_use || '').slice(0, 5000),
  is_active: b.is_active === '0' || b.is_active === 0 || b.is_active === false || b.is_active === 'false' ? 0 : 1,
  is_featured: b.is_featured === '1' || b.is_featured === 1 || b.is_featured === true || b.is_featured === 'true' ? 1 : 0
});

admin.get('/products', wrap(async (req, res) => {
  res.json(await q(`SELECT p.*, c.name AS category, c.icon AS category_icon FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.sort_order ASC, p.id DESC`));
}));

admin.post('/products/reorder', wrap(async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map(int).filter(Boolean);
  for (let i = 0; i < ids.length; i++) await q('UPDATE products SET sort_order = ? WHERE id = ?', [i, ids[i]]);
  if (ids.length) {   // anything not in the list keeps its relative order, after the listed ones
    const rest = await q(`SELECT id FROM products WHERE id NOT IN (${ids.map(() => '?').join(',')}) ORDER BY sort_order, id`, ids);
    for (let i = 0; i < rest.length; i++) await q('UPDATE products SET sort_order = ? WHERE id = ?', [ids.length + i, rest[i].id]);
  }
  res.json({ success: true });
}));

admin.post('/products', upload.single('image'), wrap(async (req, res) => {
  const f = productFields(req.body);
  if (!f.name) return res.status(400).json({ error: 'Product name is required.' });
  const [[{ m }]] = await db.getPool().query('SELECT COALESCE(MIN(sort_order),0) - 1 AS m FROM products');
  const [r] = await db.getPool().query(
    'INSERT INTO products (name, category_id, price, old_price, cost_price, stock, low_stock_alert, description, how_to_use, image, is_active, is_featured, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [f.name, f.category_id, f.price, f.old_price, f.cost_price, f.stock, f.low_stock_alert, f.description, f.how_to_use, req.file ? '/uploads/' + req.file.filename : null, f.is_active, f.is_featured, m]);
  res.json({ success: true, id: r.insertId });
}));

admin.put('/products/:id', upload.single('image'), wrap(async (req, res) => {
  const id = int(req.params.id), f = productFields(req.body);
  const [old] = await q('SELECT image FROM products WHERE id = ?', [id]);
  if (!old) return res.status(404).json({ error: 'Product not found' });
  if (!f.name) return res.status(400).json({ error: 'Product name is required.' });
  let image = old.image;
  if (req.file) { removeUpload(old.image); image = '/uploads/' + req.file.filename; }
  else if (req.body.remove_image === '1') { removeUpload(old.image); image = null; }
  await q('UPDATE products SET name=?, category_id=?, price=?, old_price=?, cost_price=?, stock=?, low_stock_alert=?, description=?, how_to_use=?, image=?, is_active=?, is_featured=? WHERE id=?',
    [f.name, f.category_id, f.price, f.old_price, f.cost_price, f.stock, f.low_stock_alert, f.description, f.how_to_use, image, f.is_active, f.is_featured, id]);
  res.json({ success: true });
}));

admin.patch('/products/:id', wrap(async (req, res) => {   // quick toggles + stock adjust
  const id = int(req.params.id), b = req.body;
  if ('is_active' in b) await q('UPDATE products SET is_active = ? WHERE id = ?', [b.is_active ? 1 : 0, id]);
  if ('is_featured' in b) await q('UPDATE products SET is_featured = ? WHERE id = ?', [b.is_featured ? 1 : 0, id]);
  if ('stock' in b) await q('UPDATE products SET stock = ? WHERE id = ?', [Math.max(0, int(b.stock)), id]);
  res.json({ success: true });
}));

admin.delete('/products/:id', wrap(async (req, res) => {
  const [p] = await q('SELECT image FROM products WHERE id = ?', [int(req.params.id)]);
  if (p) { removeUpload(p.image); await q('DELETE FROM products WHERE id = ?', [int(req.params.id)]); }
  res.json({ success: true });
}));

// ───────────────────────── ADMIN: ORDERS ─────────────────────────
admin.get('/orders', wrap(async (req, res) => {
  const where = [], params = [];
  if (req.query.status) { where.push('o.status = ?'); params.push(req.query.status); }
  if (req.query.q) { where.push('(o.order_no LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ?)'); const s = '%' + req.query.q + '%'; params.push(s, s, s); }
  const rows = await q(`SELECT o.*, (SELECT COALESCE(SUM(qty),0) FROM order_items WHERE order_id = o.id) AS item_count
    FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC LIMIT 500`, params);
  res.json(rows);
}));

admin.get('/orders/:id', wrap(async (req, res) => {
  const [o] = await q('SELECT * FROM orders WHERE id = ?', [int(req.params.id)]);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  o.items = await q('SELECT * FROM order_items WHERE order_id = ?', [o.id]);
  res.json(o);
}));

admin.patch('/orders/:id/status', wrap(async (req, res) => {
  const status = req.body.status;
  if (!['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Bad status' });
  const conn = await db.getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [[o]] = await conn.query('SELECT id, status FROM orders WHERE id = ? FOR UPDATE', [int(req.params.id)]);
    if (!o) { await conn.rollback(); return res.status(404).json({ error: 'Order not found' }); }
    const [items] = await conn.query('SELECT product_id, product_name, qty FROM order_items WHERE order_id = ?', [o.id]);
    if (status === 'cancelled' && o.status !== 'cancelled') {                       // put stock back
      for (const it of items) if (it.product_id) await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [it.qty, it.product_id]);
    } else if (o.status === 'cancelled' && status !== 'cancelled') {                // take stock again
      for (const it of items) if (it.product_id) {
        const [[p]] = await conn.query('SELECT stock FROM products WHERE id = ? FOR UPDATE', [it.product_id]);
        if (p && p.stock < it.qty) { await conn.rollback(); return res.status(409).json({ error: `Not enough stock for "${it.product_name}" to re-open this order.` }); }
        await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [it.qty, it.product_id]);
      }
    }
    await conn.query('UPDATE orders SET status = ? WHERE id = ?', [status, o.id]);
    await conn.commit(); res.json({ success: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

// ───────────────────────── ADMIN: BUYING (purchases) ─────────────────────────
admin.patch('/orders/:id/advance', wrap(async (req, res) => {
  const st = String(req.body.status || ''); if (!['unpaid', 'submitted', 'verified'].includes(st)) return res.status(400).json({ error: 'Invalid payment status.' });
  const r = await q('UPDATE orders SET advance_status = ? WHERE id = ? AND delivery_zone IS NOT NULL', [st, int(req.params.id)]);
  if (!r.affectedRows) return res.status(404).json({ error: 'Order not found.' });
  res.json({ success: true });
}));

admin.get('/purchases', wrap(async (req, res) => res.json(await q('SELECT * FROM purchases ORDER BY id DESC LIMIT 300'))));

admin.post('/purchases', wrap(async (req, res) => {
  const qty = int(req.body.qty), unit = num(req.body.unit_cost);
  if (qty < 1 || unit < 0) return res.status(400).json({ error: 'Enter a quantity and a cost.' });
  const conn = await db.getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [[p]] = await conn.query('SELECT id, name FROM products WHERE id = ? FOR UPDATE', [int(req.body.product_id)]);
    if (!p) { await conn.rollback(); return res.status(400).json({ error: 'Choose a product.' }); }
    await conn.query('INSERT INTO purchases (product_id, product_name, supplier, qty, unit_cost, total, note) VALUES (?,?,?,?,?,?,?)',
      [p.id, p.name, String(req.body.supplier || '').slice(0, 160) || null, qty, unit, qty * unit, String(req.body.note || '').slice(0, 255) || null]);
    await conn.query('UPDATE products SET stock = stock + ?, cost_price = ? WHERE id = ?', [qty, unit, p.id]);
    await conn.commit(); res.json({ success: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

// ───────────────────────── ADMIN: REPORTS / DASHBOARD ─────────────────────────
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
function range(req) {
  const today = new Date(), def = new Date(); def.setDate(def.getDate() - 29);
  const ok = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  let from = ok(req.query.from) ? req.query.from : ymd(def), to = ok(req.query.to) ? req.query.to : ymd(today);
  if (from > to) [from, to] = [to, from];
  return { from, to, a: from + ' 00:00:00', b: to + ' 23:59:59' };
}

async function buildReport(r) {
  const live = `o.status <> 'cancelled' AND o.created_at BETWEEN ? AND ?`, P = [r.a, r.b];
  const [[sum]] = await db.getPool().query(`SELECT COUNT(*) AS orders, COALESCE(SUM(o.total),0) AS revenue, COALESCE(SUM(o.subtotal),0) AS product_sales, COALESCE(SUM(o.shipping),0) AS shipping FROM orders o WHERE ${live}`, P);
  const [[cg]] = await db.getPool().query(`SELECT COALESCE(SUM(i.cost*i.qty),0) AS cogs, COALESCE(SUM(i.qty),0) AS units FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${live}`, P);
  const [[pu]] = await db.getPool().query('SELECT COALESCE(SUM(total),0) AS purchases, COUNT(*) AS purchase_count FROM purchases WHERE created_at BETWEEN ? AND ?', P);
  const [[cx]] = await db.getPool().query(`SELECT COUNT(*) AS n FROM orders o WHERE o.status='cancelled' AND o.created_at BETWEEN ? AND ?`, P);
  const days = (new Date(r.to) - new Date(r.from)) / 864e5 + 1, monthly = days > 92, fmt = monthly ? '%Y-%m' : '%Y-%m-%d';
  const s1 = await q(`SELECT DATE_FORMAT(o.created_at,'${fmt}') AS d, SUM(o.total) AS sales, SUM(o.subtotal) AS ps, COUNT(*) AS orders FROM orders o WHERE ${live} GROUP BY d`, P);
  const s2 = await q(`SELECT DATE_FORMAT(o.created_at,'${fmt}') AS d, SUM(i.cost*i.qty) AS cogs FROM order_items i JOIN orders o ON o.id=i.order_id WHERE ${live} GROUP BY d`, P);
  const s3 = await q(`SELECT DATE_FORMAT(created_at,'${fmt}') AS d, SUM(total) AS buying FROM purchases WHERE created_at BETWEEN ? AND ? GROUP BY d`, P);
  const map = {}, key = d => (map[d] = map[d] || { d, sales: 0, profit: 0, buying: 0, orders: 0 });
  // fill every day/month so the chart has no gaps
  if (monthly) {
    let y = +r.from.slice(0, 4), mo = +r.from.slice(5, 7); const ey = +r.to.slice(0, 4), em = +r.to.slice(5, 7);
    while (y < ey || (y === ey && mo <= em)) { key(y + '-' + String(mo).padStart(2, '0')); if (++mo > 12) { mo = 1; y++; } }
  } else {
    const cur = new Date(r.from + 'T00:00:00'), end = new Date(r.to + 'T00:00:00');
    while (cur <= end) { key(ymd(cur)); cur.setDate(cur.getDate() + 1); }
  }
  s1.forEach(x => { const k = key(x.d); k.sales = +x.sales; k.profit = +x.ps; k.orders = x.orders; });
  s2.forEach(x => { key(x.d).profit -= +x.cogs; });
  s3.forEach(x => { key(x.d).buying = +x.buying; });
  const byCategory = await q(`SELECT COALESCE(c.name,'Other') AS name, SUM(i.qty) AS units, SUM(i.price*i.qty) AS sales, SUM((i.price-i.cost)*i.qty) AS profit
    FROM order_items i JOIN orders o ON o.id=i.order_id LEFT JOIN products p ON p.id=i.product_id LEFT JOIN categories c ON c.id=p.category_id
    WHERE ${live} GROUP BY name ORDER BY sales DESC`, P);
  const byProduct = await q(`SELECT i.product_name AS name, SUM(i.qty) AS units, SUM(i.price*i.qty) AS sales, SUM((i.price-i.cost)*i.qty) AS profit
    FROM order_items i JOIN orders o ON o.id=i.order_id WHERE ${live} GROUP BY i.product_name ORDER BY sales DESC LIMIT 30`, P);
  const byStatus = await q('SELECT status, COUNT(*) AS n FROM orders o WHERE o.created_at BETWEEN ? AND ? GROUP BY status', P);
  const purchases = await q('SELECT * FROM purchases WHERE created_at BETWEEN ? AND ? ORDER BY id DESC LIMIT 200', P);
  return {
    from: r.from, to: r.to, monthly,
    summary: { ...sum, ...cg, ...pu, cancelled: cx.n, gross_profit: sum.product_sales - cg.cogs, avg_order: sum.orders ? sum.revenue / sum.orders : 0, net_cash: sum.revenue - pu.purchases },
    series: Object.values(map).sort((a, b) => a.d.localeCompare(b.d)), byCategory, byProduct, byStatus, purchases
  };
}

admin.get('/reports', wrap(async (req, res) => res.json(await buildReport(range(req)))));

admin.get('/dashboard', wrap(async (req, res) => {
  const t = ymd(new Date()), m = t.slice(0, 8) + '01', d30 = new Date(); d30.setDate(d30.getDate() - 29);
  const [today, month, last30] = await Promise.all([
    buildReport({ from: t, to: t, a: t + ' 00:00:00', b: t + ' 23:59:59' }),
    buildReport({ from: m, to: t, a: m + ' 00:00:00', b: t + ' 23:59:59' }),
    buildReport({ from: ymd(d30), to: t, a: ymd(d30) + ' 00:00:00', b: t + ' 23:59:59' })
  ]);
  const [[c]] = await db.getPool().query(`SELECT SUM(status='pending') AS pending, SUM(status='confirmed') AS confirmed, SUM(status='shipped') AS shipped FROM orders`);
  const lowStock = await q('SELECT id, name, stock, low_stock_alert, image FROM products WHERE is_active = 1 AND stock <= low_stock_alert ORDER BY stock ASC LIMIT 8');
  const recent = await q('SELECT id, order_no, customer_name, total, status, created_at FROM orders ORDER BY id DESC LIMIT 6');
  const [[tp]] = await db.getPool().query('SELECT COUNT(*) AS n, COALESCE(SUM(stock*cost_price),0) AS stock_value FROM products');
  res.json({ today: today.summary, month: month.summary, last30, counts: c, lowStock, recent, products: tp.n, stock_value: tp.stock_value });
}));

const csv = rows => '\ufeff' + rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\r\n');
admin.get('/export/:type', wrap(async (req, res) => {
  const r = range(req), type = req.params.type; let rows;
  if (type === 'orders') {
    const o = await q('SELECT * FROM orders WHERE created_at BETWEEN ? AND ? ORDER BY id', [r.a, r.b]);
    rows = [['Order No', 'Date', 'Customer', 'Phone', 'Address', 'Payment', 'Status', 'Subtotal', 'Shipping', 'Total', 'Advance', 'Advance status', 'Balance due'], ...o.map(x => [x.order_no, x.created_at.toISOString().slice(0, 16).replace('T', ' '), x.customer_name, x.customer_phone, x.customer_address, x.payment_method, x.status, x.subtotal, x.shipping, x.total, x.delivery_zone ? x.advance_amount : '', x.delivery_zone ? x.advance_status : '', x.delivery_zone ? x.balance_due : ''])];
  } else if (type === 'purchases') {
    const p = await q('SELECT * FROM purchases WHERE created_at BETWEEN ? AND ? ORDER BY id', [r.a, r.b]);
    rows = [['Date', 'Product', 'Supplier', 'Qty', 'Unit Cost', 'Total', 'Note'], ...p.map(x => [x.created_at.toISOString().slice(0, 16).replace('T', ' '), x.product_name, x.supplier, x.qty, x.unit_cost, x.total, x.note])];
  } else if (type === 'products') {
    const p = await q('SELECT p.*, c.name AS cat FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY p.sort_order');
    rows = [['ID', 'Name', 'Category', 'Price', 'Cost', 'Stock', 'Stock Value (cost)', 'Active'], ...p.map(x => [x.id, x.name, x.cat, x.price, x.cost_price, x.stock, x.stock * x.cost_price, x.is_active ? 'yes' : 'no'])];
  } else return res.status(404).json({ error: 'Unknown export' });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="aqualuxe-${type}-${r.from}_to_${r.to}.csv"` }).send(csv(rows));
}));

// ───────────────────────── ADMIN: customers, messages, settings ─────────────────────────
const threshold = async () => {
  const S = Object.fromEntries((await q("SELECT k, v FROM settings WHERE k IN ('vip_spend','loyal_orders')")).map(r => [r.k, r.v]));
  return { vip: num(S.vip_spend, 10000) || 10000, loyal: int(S.loyal_orders, 3) || 3 };
};
// Customers are people who ordered, grouped by phone number (017… and +88017… are the same person). Everything is calculated from orders.
async function buildCustomers() {
  const rows = await q(`SELECT a.*, o.customer_name AS name, o.customer_address AS address, o.district
    FROM (SELECT customer_phone AS phone, COUNT(*) AS total_orders, SUM(status <> 'cancelled') AS orders, SUM(status = 'cancelled') AS cancelled, SUM(status = 'delivered') AS delivered,
        COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN total END), 0) AS spent, MIN(created_at) AS first_order, MAX(created_at) AS last_order, MAX(id) AS last_id
      FROM orders GROUP BY customer_phone) a JOIN orders o ON o.id = a.last_id`);
  const archived = new Map((await q('SELECT phone_key, archived_at FROM archived_customers')).map(r => [r.phone_key, r.archived_at]));
  const T = await threshold(), by = new Map();
  for (const r of rows) {
    const key = phoneKey(r.phone), c = by.get(key);
    const x = { orders: int(r.orders), total_orders: int(r.total_orders), cancelled: int(r.cancelled), delivered: int(r.delivered), spent: num(r.spent) };
    if (!c) by.set(key, { key, phone: r.phone, name: r.name, address: r.address, district: r.district, ...x, first_order: r.first_order, last_order: r.last_order });
    else { for (const k of Object.keys(x)) c[k] += x[k]; if (r.first_order < c.first_order) c.first_order = r.first_order;
      if (r.last_order > c.last_order) Object.assign(c, { last_order: r.last_order, name: r.name, address: r.address, district: r.district, phone: r.phone }); }
  }
  return [...by.values()].map(c => {
    c.avg_order = c.orders ? Math.round(c.spent / c.orders) : 0;
    c.segment = c.spent >= T.vip ? 'vip' : c.orders >= T.loyal ? 'loyal' : c.orders >= 2 ? 'repeat' : c.orders === 1 ? 'new' : 'none';
    c.archived = archived.has(c.key); c.archived_at = archived.get(c.key) || null;
    return c;
  }).sort((a, b) => b.spent - a.spent || b.total_orders - a.total_orders).slice(0, 2000);
}
admin.get('/customers', wrap(async (req, res) => res.json({ customers: await buildCustomers(), thresholds: await threshold() })));
admin.get('/customers/:key/orders', wrap(async (req, res) => {
  const key = String(req.params.key); if (!/^\d{6,10}$/.test(key)) return res.status(400).json({ error: 'Invalid customer.' });
  const phones = (await q('SELECT DISTINCT customer_phone FROM orders')).map(r => r.customer_phone).filter(p => phoneKey(p) === key);
  if (!phones.length) return res.json([]);
  res.json(await q(`SELECT id, order_no, status, total, payment_method, delivery_zone, advance_amount, advance_status, balance_due, created_at FROM orders WHERE customer_phone IN (?) ORDER BY id DESC LIMIT 200`, [phones]));
}));
// Archive = hide from the list. Orders, payments and invoices stay exactly as they are.
admin.post('/customers/:key/archive', wrap(async (req, res) => {
  const key = String(req.params.key); if (!/^\d{6,10}$/.test(key)) return res.status(400).json({ error: 'Invalid customer.' });
  await q('INSERT INTO archived_customers (phone_key, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE archived_at = CURRENT_TIMESTAMP', [key, String(req.body.name || '').slice(0, 160) || null]);
  res.json({ success: true });
}));
admin.post('/customers/:key/restore', wrap(async (req, res) => {
  const key = String(req.params.key); if (!/^\d{6,10}$/.test(key)) return res.status(400).json({ error: 'Invalid customer.' });
  await q('DELETE FROM archived_customers WHERE phone_key = ?', [key]); res.json({ success: true });
}));
admin.get('/messages', wrap(async (req, res) => res.json(await q('SELECT * FROM messages ORDER BY id DESC LIMIT 200'))));
admin.patch('/messages/:id', wrap(async (req, res) => { await q('UPDATE messages SET is_read = ? WHERE id = ?', [req.body.is_read ? 1 : 0, int(req.params.id)]); res.json({ success: true }); }));
admin.delete('/messages/:id', wrap(async (req, res) => { await q('DELETE FROM messages WHERE id = ?', [int(req.params.id)]); res.json({ success: true }); }));
admin.get('/settings', wrap(async (req, res) => { const r = await q('SELECT k, v FROM settings'); res.json(Object.fromEntries(r.map(x => [x.k, x.v]))); }));
admin.put('/settings', wrap(async (req, res) => {
  const allowed = ['store_name', 'phone', 'whatsapp', 'email', 'address', 'announcement', 'vip_spend', 'loyal_orders'];
  for (const k of ['vip_spend', 'loyal_orders']) if (k in req.body && !(num(req.body[k]) > 0)) return res.status(400).json({ error: 'Customer limits must be numbers greater than 0.' });
  for (const k of allowed) if (k in req.body) await q('REPLACE INTO settings (k, v) VALUES (?,?)', [k, String(req.body[k]).slice(0, 300)]);
  res.json({ success: true });
}));

// ───────────────────────── errors + start ─────────────────────────
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image is too big (max 5 MB).' : err.message });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err); res.status(500).json({ error: 'Server error. Please try again.' });
});

db.init().then(() => {
  app.listen(cfg.port, () => console.log(`\n  AquaLuxe is running!\n  Customer website : http://localhost:${cfg.port}\n  Admin panel      : http://localhost:${cfg.port}/admin\n`));
}).catch(e => {
  console.error('\n  Could not connect to MySQL: ' + e.message + '\n  -> Open XAMPP and click START next to MySQL, then run "npm start" again.\n  -> If your MySQL has a password, edit src/config.js\n');
  process.exit(1);
});

/* AquaLuxe Admin panel - one file, one section per page */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '৳' + Math.round(Number(n) || 0).toLocaleString('en-US');
const moneyX = n => { n = Number(n) || 0; return '৳' + (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })); };
const dt = s => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const d0 = s => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const TOKEN = localStorage.getItem('aq_admin');
if (!TOKEN) location.replace('/admin/login.html');
const logout = async () => { try { await api('/logout', { method: 'POST' }); } catch (e) {} localStorage.removeItem('aq_admin'); location.replace('/admin/login.html'); };

async function api(path, opts = {}) {
  const o = { ...opts, headers: { Authorization: 'Bearer ' + TOKEN, ...(opts.headers || {}) } };
  if (o.json) { o.body = JSON.stringify(o.json); o.headers['Content-Type'] = 'application/json'; }
  const r = await fetch('/api/admin' + path, o);
  if (r.status === 401) { localStorage.removeItem('aq_admin'); location.replace('/admin/login.html'); throw new Error('Please log in again.'); }
  if (opts.raw) return r;
  let d = {}; try { d = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(d.error || 'Something went wrong.');
  return d;
}
function toast(m, err) { const t = $('#toast'); t.textContent = m; t.className = 'toast on' + (err ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => t.className = 'toast', 2600); }
const run = async fn => { try { return await fn(); } catch (e) { toast(e.message, true); } };

/* modal */
function modal(title, body, foot = '', cls = '') {
  const m = document.createElement('div'); m.className = 'mask';
  m.innerHTML = `<div class="modal ${cls}"><div class="mh"><h3>${title}</h3><button data-x>×</button></div><div class="mb">${body}</div>${foot ? `<div class="mf">${foot}</div>` : ''}</div>`;
  m.onclick = e => { if (e.target === m || e.target.dataset.x !== undefined) m.remove(); }; document.body.appendChild(m); return m;
}
const confirmBox = (msg, yes = 'Yes, delete') => new Promise(res => { const m = modal('Please confirm', `<p>${msg}</p>`, `<button class="btn line" data-x>Cancel</button><button class="btn red" id="cy">${yes}</button>`, 'sm'); $('#cy', m).onclick = () => { m.remove(); res(true); }; m.addEventListener('click', e => { if (e.target === m || e.target.dataset.x !== undefined) res(false); }); });

/* simple SVG bar chart (no libraries needed) */
function chart(series, keys) {
  const W = 760, H = 250, L = 52, B = 28, T = 10, R = 8, pw = W - L - R, ph = H - T - B;
  const max = Math.max(1, ...series.flatMap(s => keys.map(k => s[k.key]))), step = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / step) * step;
  const gw = pw / Math.max(1, series.length), bw = Math.max(2, Math.min(18, gw / (keys.length + .8)));
  let g = ''; for (let i = 0; i <= 4; i++) { const y = T + ph - ph * i / 4, v = top * i / 4; g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#e8eeea"/><text x="${L - 8}" y="${y + 4}" text-anchor="end">${v >= 1000 ? Math.round(v / 100) / 10 + 'k' : Math.round(v)}</text>`; }
  const every = Math.ceil(series.length / 10);
  series.forEach((s, i) => {
    const x0 = L + gw * i + (gw - bw * keys.length) / 2;
    keys.forEach((k, j) => { const h = ph * s[k.key] / top; g += `<rect class="bar" x="${x0 + j * bw}" y="${T + ph - h}" width="${bw - 1}" height="${Math.max(0, h)}" rx="2" fill="${k.color}"><title>${s.d} · ${k.label}: ${money(s[k.key])}</title></rect>`; });
    if (i % every === 0) g += `<text x="${L + gw * i + gw / 2}" y="${H - 8}" text-anchor="middle">${s.d.length > 7 ? s.d.slice(8) + '/' + s.d.slice(5, 7) : s.d}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}
const legend = keys => `<div class="legend">${keys.map(k => `<span><i style="background:${k.color}"></i>${k.label}</span>`).join('')}</div>`;
const SELL = { key: 'sales', color: '#1f9d55', label: 'Selling (sales)' }, BUY = { key: 'buying', color: '#ee8a2b', label: 'Buying (stock purchases)' };
const bars = (rows, valKey, labelFn) => { const m = Math.max(1, ...rows.map(r => r[valKey])); return `<div class="bars">${rows.map(r => `<div class="b"><div class="l"><span>${esc(r.name)}</span><b>${labelFn ? labelFn(r) : money(r[valKey])}</b></div><div class="t"><i style="width:${r[valKey] / m * 100}%"></i></div></div>`).join('') || '<div class="empty">No sales in this period yet.</div>'}</div>`; };
const kpi = (label, val, sub, ico, cls = '') => `<div class="kpi ${cls}"><i>${ico}</i><span>${label}</span><b>${val}</b><small>${sub || '&nbsp;'}</small></div>`;
const thumb = p => p.image ? `<img src="${esc(p.image)}" alt="">` : esc(p.category_icon || '🐟');
const statusPill = s => `<span class="pill ${s}">${s}</span>`;
const stockPill = p => p.stock <= 0 ? '<span class="pill out">Out of stock</span>' : p.stock <= p.low_stock_alert ? '<span class="pill low">Low</span>' : '<span class="pill ok">In stock</span>';
let CATS = [];

/* ───────────────── router ───────────────── */
const TITLES = { dashboard: 'Dashboard', orders: 'Orders', products: 'Product Store', stock: 'Buying & Stock', reports: 'Reports', customers: 'Customers', messages: 'Messages', aichat: 'AI Chat', settings: 'Settings' };
async function route() {
  const r = (location.hash.slice(1) || 'dashboard'), page = PAGES[r] ? r : 'dashboard';
  $$('.nv[data-r]').forEach(a => a.classList.toggle('on', a.dataset.r === page)); $('#title').textContent = TITLES[page]; $('#side').classList.remove('on');
  $('#view').innerHTML = '<div class="empty">Loading…</div>'; await run(() => PAGES[page]());
}

const PAGES = {
  /* ───── DASHBOARD ───── */
  async dashboard() {
    const d = await api('/dashboard'), t = d.today, m = d.month, l = d.last30;
    $('#view').innerHTML = `
    <div class="toolbar"><a class="btn" href="#products" id="qa1">＋ Add product</a><a class="btn line" href="#stock">📦 Record purchase</a><a class="btn line" href="#orders">🧾 View orders</a></div>
    <div class="kpis">${kpi("Today's sales", money(t.revenue), t.orders + ' orders today', '💰', 'g')}${kpi('This month sales', money(m.revenue), m.orders + ' orders', '📅', 'g')}${kpi('This month profit', money(m.gross_profit), 'Selling price − cost price', '📈', 'g')}${kpi('Pending orders', d.counts.pending || 0, 'Need your confirmation', '⏳', 'o')}</div>
    <div class="kpis">${kpi('Bought this month', money(m.purchases), m.purchase_count + ' stock purchases', '🛒', 'o')}${kpi('Low / out of stock', d.lowStock.length, 'Products to refill', '⚠️', d.lowStock.length ? 'r' : '')}${kpi('Products', d.products, 'In your store', '🛍️')}${kpi('Stock value', money(d.stock_value), 'At cost price', '🏷️')}</div>
    <div class="cols"><div class="card"><h3>Selling vs Buying – last 30 days ${legend([SELL, BUY])}</h3>${chart(l.series, [SELL, BUY])}</div>
      <div class="card"><h3>⚠️ Refill soon</h3>${d.lowStock.map(p => `<div class="lowrow"><div class="th">${thumb(p)}</div><div><b>${esc(p.name)}</b><small>${p.stock <= 0 ? 'Out of stock' : p.stock + ' left'}</small></div><a class="btn sm line" href="#stock">Buy</a></div>`).join('') || '<div class="empty"><b>✅</b>All products have enough stock.</div>'}</div></div>
    <div class="cols eq"><div class="card"><h3>Top selling products <small>last 30 days</small></h3>${bars(l.byProduct.slice(0, 6), 'sales')}</div>
      <div class="card"><h3>Recent orders <a class="btn sm line" href="#orders">All orders</a></h3><div class="tw"><table class="tbl"><tbody>${d.recent.map(o => `<tr class="click" data-o="${o.id}"><td><b>${esc(o.order_no)}</b><br><small style="color:var(--muted)">${esc(o.customer_name)}</small></td><td>${statusPill(o.status)}</td><td class="r"><b>${money(o.total)}</b><br><small style="color:var(--muted)">${dt(o.created_at)}</small></td></tr>`).join('') || '<tr><td class="empty">No orders yet</td></tr>'}</tbody></table></div></div></div>`;
    $$('[data-o]', $('#view')).forEach(r => r.onclick = () => orderModal(r.dataset.o));
    $('#qa1').onclick = e => { e.preventDefault(); location.hash = 'products'; setTimeout(() => productForm(), 400); };
  },

  /* ───── ORDERS (drag cards between columns) ───── */
  async orders() {
    const COLS = [['pending', '⏳ Pending'], ['confirmed', '✅ Confirmed'], ['shipped', '🚚 Shipped'], ['delivered', '🏠 Delivered'], ['cancelled', '✖ Cancelled']];
    let view = localStorage.getItem('aq_oview') || 'board', status = '', qs = '';
    $('#view').innerHTML = `<div class="toolbar"><div class="seg"><button data-v="board">Board</button><button data-v="list">List</button></div><input class="inp grow" id="oq" placeholder="🔍 Search order no, name or phone"><select class="sel" id="os"><option value="">All statuses</option>${COLS.map(c => `<option value="${c[0]}">${c[1].slice(2)}</option>`).join('')}</select></div><div id="ob"></div>`;
    const draw = async () => {
      $$('.seg button').forEach(b => b.classList.toggle('on', b.dataset.v === view)); $('#os').style.display = view === 'list' ? '' : 'none';
      const rows = await api('/orders?' + new URLSearchParams({ q: qs, status: view === 'list' ? status : '' })); const box = $('#ob');
      if (view === 'list') {
        box.innerHTML = `<div class="card tw"><table class="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Payment</th><th>Status</th><th class="r">Total</th></tr></thead><tbody>${rows.map(o => `<tr class="click" data-o="${o.id}"><td><b>${esc(o.order_no)}</b></td><td>${esc(o.customer_name)}<br><small style="color:var(--muted)">${esc(o.customer_phone)}</small></td><td>${dt(o.created_at)}</td><td>${esc(o.payment_method.toUpperCase())}</td><td>${statusPill(o.status)}</td><td class="r"><b>${money(o.total)}</b></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No orders found</td></tr>'}</tbody></table></div>`;
        $$('[data-o]', box).forEach(r => r.onclick = () => orderModal(r.dataset.o, draw)); return;
      }
      box.innerHTML = `<div class="hint">💡 Drag an order card to another column to change its status. Click a card to see details.</div><div class="board">${COLS.map(c => { const list = rows.filter(o => o.status === c[0]); return `<div class="col" data-s="${c[0]}"><h4><span>${c[1]}</span><span>${list.length}</span></h4>${list.map(o => `<div class="oc" draggable="true" data-id="${o.id}"><span class="no">${esc(o.order_no)}</span><b>${esc(o.customer_name)}</b><div class="row"><span>${o.item_count} item${o.item_count == 1 ? '' : 's'} · ${dt(o.created_at)}</span><b style="color:var(--text)">${money(o.total)}</b></div></div>`).join('')}</div>`; }).join('')}</div>`;
      let drag = null;
      $$('.oc', box).forEach(c => { c.ondragstart = () => { drag = c; setTimeout(() => c.classList.add('dragging'), 0); }; c.ondragend = () => c.classList.remove('dragging'); c.onclick = () => orderModal(c.dataset.id, draw); });
      $$('.col', box).forEach(col => {
        col.ondragover = e => { e.preventDefault(); col.classList.add('over'); }; col.ondragleave = () => col.classList.remove('over');
        col.ondrop = async e => { e.preventDefault(); col.classList.remove('over'); if (!drag || col.dataset.s === drag.closest('.col').dataset.s) return;
          if (col.dataset.s === 'cancelled' && !await confirmBox('Cancel this order? The stock will be put back.', 'Yes, cancel order')) return;
          await run(async () => { await api(`/orders/${drag.dataset.id}/status`, { method: 'PATCH', json: { status: col.dataset.s } }); toast('Order moved to ' + col.dataset.s); await draw(); badges(); }); };
      });
    };
    $$('.seg button').forEach(b => b.onclick = () => { view = b.dataset.v; localStorage.setItem('aq_oview', view); draw(); });
    let t; $('#oq').oninput = e => { clearTimeout(t); t = setTimeout(() => { qs = e.target.value.trim(); draw(); }, 300); }; $('#os').onchange = e => { status = e.target.value; draw(); };
    await draw();
  },

  /* ───── PRODUCT STORE (drag & drop) ───── */
  async products() {
    let view = localStorage.getItem('aq_pview') || 'grid', q = '', cat = '', all = await api('/products');
    CATS = CATS.length ? CATS : await (await fetch('/api/categories')).json();
    $('#view').innerHTML = `<div class="toolbar"><button class="btn" id="addP">＋ Add product</button><input class="inp grow" id="pq" placeholder="🔍 Search products"><select class="sel" id="pc"><option value="">All categories</option>${CATS.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><div class="seg"><button data-v="grid">Grid</button><button data-v="table">Table</button></div><a class="btn line" id="exp">⬇ Export CSV</a></div><div id="pb"></div>`;
    const draw = () => {
      $$('.seg button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
      const list = all.filter(p => (!cat || p.category_id == cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase()))), box = $('#pb'), canDrag = !q && !cat;
      if (view === 'table') {
        box.innerHTML = `<div class="card tw"><table class="tbl"><thead><tr><th></th><th>Product</th><th>Category</th><th class="r">Price</th><th class="r">Cost</th><th class="r">Stock</th><th>Status</th><th></th></tr></thead><tbody>${list.map(p => `<tr><td style="width:56px"><div class="lowrow" style="padding:0"><div class="th">${thumb(p)}</div></div></td><td><b>${esc(p.name)}</b></td><td>${esc(p.category || '-')}</td><td class="r">${money(p.price)}</td><td class="r">${money(p.cost_price)}</td><td class="r">${p.stock}</td><td>${p.is_active ? stockPill(p) : '<span class="pill off">Hidden</span>'}</td><td class="r"><button class="btn sm line" data-e="${p.id}">Edit</button> <button class="btn sm red" data-d="${p.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">No products</td></tr>'}</tbody></table></div>`;
      } else {
        box.innerHTML = `<div class="hint">${canDrag ? '🖐 <b>Drag &amp; drop</b> product cards to arrange how they appear on your website. The order saves automatically.' : 'Clear the search / category filter to drag products and change their order.'}</div><div class="pgrid" id="pg">${list.map((p, i) => `<div class="pc ${canDrag ? 'drag' : ''} ${p.is_active ? '' : 'inactive'}" draggable="${canDrag}" data-id="${p.id}"><div class="im">${thumb(p)}${canDrag ? `<span class="grip">⠿ drag</span>` : ''}<button class="star" data-f="${p.id}" title="Show on homepage as featured">${p.is_featured ? '⭐' : '☆'}</button></div><div class="bd"><h4>${esc(p.name)}</h4><div class="meta"><b>${money(p.price)}</b>${p.is_active ? stockPill(p) : '<span class="pill off">Hidden</span>'}</div><div class="meta" style="color:var(--muted);font-size:.8rem"><span>${esc(p.category || '')}</span><span>Stock: <b style="color:var(--text)">${p.stock}</b></span></div><div class="acts"><button class="btn sm line" data-e="${p.id}">✏️ Edit</button><button class="btn sm line" data-t="${p.id}">${p.is_active ? '👁 Hide' : '👁 Show'}</button><button class="btn sm red" data-d="${p.id}">🗑</button></div></div></div>`).join('') || '<div class="empty"><b>🛍️</b>No products found.</div>'}</div>`;
        if (canDrag) dnd($('#pg'));
      }
      $$('[data-e]', box).forEach(b => b.onclick = () => productForm(all.find(p => p.id == b.dataset.e)));
      $$('[data-d]', box).forEach(b => b.onclick = async () => { const p = all.find(p => p.id == b.dataset.d); if (await confirmBox(`Delete <b>${esc(p.name)}</b>? This cannot be undone.`)) run(async () => { await api('/products/' + p.id, { method: 'DELETE' }); all = all.filter(x => x.id !== p.id); toast('Product deleted'); draw(); }); });
      $$('[data-t]', box).forEach(b => b.onclick = () => run(async () => { const p = all.find(p => p.id == b.dataset.t); p.is_active = p.is_active ? 0 : 1; await api('/products/' + p.id, { method: 'PATCH', json: { is_active: p.is_active } }); toast(p.is_active ? 'Product is now visible on the website' : 'Product hidden from the website'); draw(); }));
      $$('[data-f]', box).forEach(b => b.onclick = () => run(async () => { const p = all.find(p => p.id == b.dataset.f); p.is_featured = p.is_featured ? 0 : 1; await api('/products/' + p.id, { method: 'PATCH', json: { is_featured: p.is_featured } }); toast(p.is_featured ? 'Added to Featured products' : 'Removed from Featured'); draw(); }));
    };
    function dnd(grid) {
      let drag = null;
      $$('.pc', grid).forEach(c => {
        c.ondragstart = e => { drag = c; e.dataTransfer.effectAllowed = 'move'; setTimeout(() => c.classList.add('dragging'), 0); };
        c.ondragend = () => { c.classList.remove('dragging'); const ids = $$('.pc', grid).map(x => Number(x.dataset.id)); all.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)); run(async () => { await api('/products/reorder', { method: 'POST', json: { ids } }); toast('Order saved ✓'); }); drag = null; };
        c.ondragover = e => { e.preventDefault(); if (!drag || drag === c) return; const dragFirst = drag.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING; grid.insertBefore(drag, dragFirst ? c.nextSibling : c); };
      });
    }
    $('#addP').onclick = () => productForm(); $('#pq').oninput = e => { q = e.target.value; draw(); }; $('#pc').onchange = e => { cat = e.target.value; draw(); };
    $$('.seg button').forEach(b => b.onclick = () => { view = b.dataset.v; localStorage.setItem('aq_pview', view); draw(); });
    $('#exp').onclick = () => download('/export/products', 'products.csv');
    window.refreshProducts = async () => { all = await api('/products'); draw(); };
    draw();
  },

  /* ───── BUYING & STOCK ───── */
  async stock() {
    const [prods, purch] = await Promise.all([api('/products'), api('/purchases')]); let low = false;
    $('#view').innerHTML = `<div class="cols"><div class="card"><h3>📦 Stock <label class="chk" style="font-size:.85rem;font-weight:500"><input type="checkbox" id="lowOnly"> Low stock only</label></h3><div class="tw" id="stt"></div></div>
      <div class="card"><h3>🛒 Record a purchase <small>Buying from supplier</small></h3><p style="color:var(--muted);font-size:.88rem;margin-bottom:14px">When you buy new stock, add it here. Stock goes up and your buying report updates.</p>
        <form id="pf" class="fg"><div><label class="l">Product</label><select class="sel" name="product_id" required><option value="">Choose product…</option>${prods.map(p => `<option value="${p.id}" data-c="${p.cost_price}">${esc(p.name)} (stock ${p.stock})</option>`).join('')}</select></div>
        <div class="fg c2"><div><label class="l">Quantity bought</label><input class="inp" name="qty" type="number" min="1" required></div><div><label class="l">Cost per item (৳)</label><input class="inp" name="unit_cost" type="number" min="0" step="0.01" required></div></div>
        <div><label class="l">Supplier <small>(optional)</small></label><input class="inp" name="supplier" placeholder="e.g. Chawkbazar wholesaler"></div><div><label class="l">Note <small>(optional)</small></label><input class="inp" name="note"></div>
        <div id="ptot" style="font-weight:700;font-size:1.1rem">Total: ৳0</div><button class="btn org">Save purchase</button></form></div></div>
      <div class="card"><h3>Purchase history <small>latest 300</small></h3><div class="tw"><table class="tbl"><thead><tr><th>Date</th><th>Product</th><th>Supplier</th><th class="r">Qty</th><th class="r">Unit cost</th><th class="r">Total</th></tr></thead><tbody>${purch.map(p => `<tr><td>${dt(p.created_at)}</td><td>${esc(p.product_name)}</td><td>${esc(p.supplier || '-')}</td><td class="r">${p.qty}</td><td class="r">${money(p.unit_cost)}</td><td class="r"><b>${money(p.total)}</b></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No purchases recorded yet</td></tr>'}</tbody></table></div></div>`;
    const draw = () => { const list = prods.filter(p => !low || p.stock <= p.low_stock_alert); $('#stt').innerHTML = `<table class="tbl"><thead><tr><th>Product</th><th>Status</th><th class="r">Stock</th><th class="r">Value</th></tr></thead><tbody>${list.map(p => `<tr><td><b>${esc(p.name)}</b><br><small style="color:var(--muted)">Cost ${money(p.cost_price)} · Price ${money(p.price)}</small></td><td>${stockPill(p)}</td><td class="r"><input class="inp stockin" type="number" min="0" value="${p.stock}" data-s="${p.id}"></td><td class="r">${money(p.stock * p.cost_price)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Nothing to show</td></tr>'}</tbody></table>`;
      $$('[data-s]', $('#view')).forEach(i => i.onchange = () => run(async () => { await api('/products/' + i.dataset.s, { method: 'PATCH', json: { stock: Number(i.value) } }); const p = prods.find(x => x.id == i.dataset.s); p.stock = Math.max(0, Number(i.value)); toast('Stock updated ✓'); draw(); })); };
    $('#lowOnly').onchange = e => { low = e.target.checked; draw(); }; draw();
    const f = $('#pf'), tot = () => $('#ptot').textContent = 'Total: ' + money(f.qty.value * f.unit_cost.value);
    f.qty.oninput = f.unit_cost.oninput = tot; f.product_id.onchange = () => { const o = f.product_id.selectedOptions[0]; if (o && o.dataset.c) { f.unit_cost.value = o.dataset.c; tot(); } };
    f.onsubmit = e => { e.preventDefault(); run(async () => { await api('/purchases', { method: 'POST', json: Object.fromEntries(new FormData(f)) }); toast('Purchase saved – stock updated ✓'); PAGES.stock(); }); };
  },

  /* ───── REPORTS (buying & selling) ───── */
  async reports() {
    const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), now = new Date(); let from = new Date(now - 29 * 864e5), to = now;
    const sh = n => new Date(now.getTime() - n * 864e5);
    $('#view').innerHTML = `<div class="toolbar no-print"><div class="seg" id="pre"><button data-p="0">Today</button><button data-p="6">7 days</button><button data-p="29" class="on">30 days</button><button data-p="m">This month</button><button data-p="y">This year</button></div>
      <input type="date" class="inp" id="rf"><span>to</span><input type="date" class="inp" id="rt"><span class="grow"></span><button class="btn line" id="prt">🖨 Print</button><button class="btn line" id="e1">⬇ Sales CSV</button><button class="btn line" id="e2">⬇ Buying CSV</button></div><div id="rb"></div>`;
    const draw = async () => {
      $('#rf').value = ymd(from); $('#rt').value = ymd(to); const r = await api(`/reports?from=${ymd(from)}&to=${ymd(to)}`), s = r.summary;
      $('#rb').innerHTML = `<p style="color:var(--muted);margin-bottom:14px">Report: <b>${d0(r.from)}</b> to <b>${d0(r.to)}</b></p>
      <div class="kpis">${kpi('Total selling (revenue)', money(s.revenue), s.orders + ' orders · avg ' + money(s.avg_order), '💰', 'g')}${kpi('Total buying (purchases)', money(s.purchases), s.purchase_count + ' purchases', '🛒', 'o')}${kpi('Gross profit', money(s.gross_profit), 'Sales − cost of goods (' + money(s.cogs) + ')', '📈', 'g')}${kpi('Cash difference', money(s.net_cash), 'Selling − buying', '⚖️', s.net_cash < 0 ? 'r' : '')}</div>
      <div class="card" style="margin-bottom:16px"><h3>Selling vs Buying ${r.monthly ? '(per month)' : '(per day)'} ${legend([SELL, BUY])}</h3>${chart(r.series, [SELL, BUY])}</div>
      <div class="cols eq"><div class="card"><h3>Sales by category</h3>${bars(r.byCategory, 'sales')}</div>
        <div class="card"><h3>Orders by status</h3><table class="tbl"><tbody>${r.byStatus.map(x => `<tr><td>${statusPill(x.status)}</td><td class="r"><b>${x.n}</b></td></tr>`).join('') || '<tr><td class="empty">No orders</td></tr>'}</tbody></table></div></div>
      <div class="card" style="margin-bottom:16px"><h3>Selling – by product</h3><div class="tw"><table class="tbl"><thead><tr><th>Product</th><th class="r">Units sold</th><th class="r">Sales</th><th class="r">Profit</th></tr></thead><tbody>${r.byProduct.map(p => `<tr><td>${esc(p.name)}</td><td class="r">${p.units}</td><td class="r">${money(p.sales)}</td><td class="r" style="color:var(--green2)"><b>${money(p.profit)}</b></td></tr>`).join('') || '<tr><td colspan="4" class="empty">No sales in this period</td></tr>'}</tbody></table></div></div>
      <div class="card"><h3>Buying – purchases in this period</h3><div class="tw"><table class="tbl"><thead><tr><th>Date</th><th>Product</th><th>Supplier</th><th class="r">Qty</th><th class="r">Total</th></tr></thead><tbody>${r.purchases.map(p => `<tr><td>${dt(p.created_at)}</td><td>${esc(p.product_name)}</td><td>${esc(p.supplier || '-')}</td><td class="r">${p.qty}</td><td class="r"><b>${money(p.total)}</b></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No purchases in this period</td></tr>'}</tbody></table></div></div>`;
    };
    $$('#pre button').forEach(b => b.onclick = () => { $$('#pre button').forEach(x => x.classList.remove('on')); b.classList.add('on'); to = new Date(); const p = b.dataset.p; from = p === 'm' ? new Date(now.getFullYear(), now.getMonth(), 1, 12) : p === 'y' ? new Date(now.getFullYear(), 0, 1, 12) : sh(Number(p)); run(draw); });
    $('#rf').onchange = e => { from = new Date(e.target.value + 'T12:00:00'); $$('#pre button').forEach(x => x.classList.remove('on')); run(draw); }; $('#rt').onchange = e => { to = new Date(e.target.value + 'T12:00:00'); $$('#pre button').forEach(x => x.classList.remove('on')); run(draw); };
    $('#prt').onclick = () => print(); $('#e1').onclick = () => download(`/export/orders?from=${ymd(from)}&to=${ymd(to)}`, 'sales.csv'); $('#e2').onclick = () => download(`/export/purchases?from=${ymd(from)}&to=${ymd(to)}`, 'buying.csv');
    await draw();
  },

  async customers() {
    const data = await api('/customers'), all = data.customers || [], T = data.thresholds || { vip: 10000, loyal: 3 };
    const SEG = { vip: ['High-value', 'vip'], loyal: ['Loyal', 'loyal'], repeat: ['Repeat', 'repeat'], new: ['New', 'new'], none: ['No completed order', 'off'] };
    const F = { q: '', seg: '', ord: 0, spent: '', last: '', sort: 'spent', arch: false }, sel = new Set(), DAY = 864e5;
    const view = $('#view');
    view.innerHTML = `<div class="kpis" id="ck"></div>
      <div class="card" style="margin-bottom:16px"><div class="cfilters">
        <input class="inp" id="cq" placeholder="🔍 Search name, phone or address">
        <select class="sel" id="cseg"><option value="">All customers</option><option value="vip">⭐ High-value (spent ${money(T.vip)}+)</option><option value="loyal">💚 Loyal (${T.loyal}+ orders)</option><option value="repeat">🔁 Repeat (2+ orders)</option><option value="new">🆕 New (1 order)</option><option value="none">No completed order</option></select>
        <select class="sel" id="cord"><option value="0">Any number of orders</option><option value="2">2+ orders</option><option value="3">3+ orders</option><option value="5">5+ orders</option><option value="10">10+ orders</option></select>
        <input class="inp" id="cspent" type="number" min="0" placeholder="Min. total spent (৳)">
        <select class="sel" id="clast"><option value="">Any last-order date</option><option value="recent">Ordered in last 30 days</option><option value="lapsed">No order for 60+ days</option><option value="cancel">Has cancelled orders</option></select>
        <select class="sel" id="csort"><option value="spent">Sort: highest spending</option><option value="orders">Sort: most orders</option><option value="recent">Sort: latest order</option><option value="avg">Sort: average order</option><option value="name">Sort: name A–Z</option></select>
        <label class="chk"><input type="checkbox" id="carch"> Show archived</label>
        <button class="btn sm line" id="creset">Reset</button></div></div>
      <div class="card selbar" id="csel" style="display:none"></div>
      <div class="card tw"><table class="tbl"><thead><tr><th style="width:34px"><input type="checkbox" id="call" title="Select all shown"></th><th>Customer</th><th>Phone</th><th class="r">Orders</th><th class="r">Total spent</th><th class="r">Avg. order</th><th>Last order</th><th style="width:200px"></th></tr></thead><tbody id="cbody"></tbody></table></div>
      <p class="hint" style="margin-top:12px">Customers are built from your orders (same phone number = same customer). Archiving only hides a customer from this list: their orders, payments and invoices are kept, and they return automatically if they order again.</p>`;
    const list = () => {
      const q = F.q.toLowerCase(), now = Date.now();
      let r = all.filter(c => c.archived === F.arch && (!q || (c.name + ' ' + c.phone + ' ' + (c.address || '')).toLowerCase().includes(q)) && (!F.seg || c.segment === F.seg) && c.orders >= F.ord && (!F.spent || c.spent >= Number(F.spent))
        && (!F.last || (F.last === 'recent' ? now - new Date(c.last_order) <= 30 * DAY : F.last === 'lapsed' ? now - new Date(c.last_order) >= 60 * DAY : c.cancelled > 0)));
      const S = { spent: (a, b) => b.spent - a.spent, orders: (a, b) => b.orders - a.orders || b.spent - a.spent, recent: (a, b) => new Date(b.last_order) - new Date(a.last_order), avg: (a, b) => b.avg_order - a.avg_order, name: (a, b) => String(a.name).localeCompare(String(b.name)) };
      return r.sort(S[F.sort]);
    };
    const draw = () => {
      const act = all.filter(c => !c.archived), rows = list(), shownKeys = new Set(rows.map(c => c.key));
      [...sel].forEach(k => { if (!shownKeys.has(k)) sel.delete(k); });
      const rev = act.reduce((t, c) => t + c.spent, 0);
      $('#ck').innerHTML = kpi('Customers', act.length, all.length - act.length ? (all.length - act.length) + ' archived' : 'Who ordered from you', '👥', 'g') + kpi('Repeat customers', act.filter(c => c.orders >= 2).length, act.length ? Math.round(act.filter(c => c.orders >= 2).length / act.length * 100) + '% order again' : '', '🔁', 'g')
        + kpi('High-value', act.filter(c => c.segment === 'vip').length, 'Spent ' + money(T.vip) + '+', '⭐', 'o') + kpi('Total from customers', money(rev), act.length ? 'Avg. ' + money(rev / act.length) + ' per customer' : '', '💰');
      $('#cbody').innerHTML = rows.map(c => { const sg = SEG[c.segment]; return `<tr><td><input type="checkbox" data-ck="${c.key}" ${sel.has(c.key) ? 'checked' : ''}></td>
        <td><b>${esc(c.name)}</b> <span class="pill ${sg[1]}">${sg[0]}</span><br><small style="color:var(--muted)">${esc(c.district || '')}${c.district && c.address ? ' · ' : ''}${esc((c.address || '').slice(0, 46))}</small></td>
        <td>${esc(c.phone)}</td><td class="r"><b>${c.orders}</b>${c.cancelled ? `<br><small style="color:var(--red)">${c.cancelled} cancelled</small>` : ''}</td><td class="r"><b>${money(c.spent)}</b></td><td class="r">${money(c.avg_order)}</td><td>${d0(c.last_order)}</td>
        <td style="white-space:nowrap"><button class="btn sm line" data-chist="${c.key}">History</button> <a class="btn sm line" target="_blank" rel="noopener" href="https://wa.me/${esc(waNum(c.phone))}">WhatsApp</a> ${c.archived ? `<button class="btn sm line" data-crest="${c.key}">Restore</button>` : `<button class="xbtn" title="Archive customer" aria-label="Archive ${esc(c.name)}" data-carch="${c.key}">×</button>`}</td></tr>`; }).join('')
        || `<tr><td colspan="8" class="empty">${all.length ? 'No customers match these filters.' : 'Customers appear here after their first order.'}</td></tr>`;
      $('#call').checked = rows.length > 0 && rows.every(c => sel.has(c.key));
      const bar = $('#csel'), picked = all.filter(c => sel.has(c.key));
      bar.style.display = picked.length ? '' : 'none';
      bar.innerHTML = `<b>${picked.length} selected</b> · ${money(picked.reduce((t, c) => t + c.spent, 0))} total spent <span style="flex:1"></span><button class="btn sm line" id="ccopy">📋 Copy phone numbers</button><button class="btn sm line" id="ccsv">⬇ Download list (CSV)</button><button class="btn sm line" id="cclr">Clear</button>
        <small style="flex-basis:100%;color:var(--muted)">Use the list for your own WhatsApp/SMS promotion. Sending messages from this panel is not set up yet.</small>`;
      bind(picked);
    };
    const bind = picked => {
      $$('[data-ck]', view).forEach(i => i.onchange = () => { i.checked ? sel.add(i.dataset.ck) : sel.delete(i.dataset.ck); draw(); });
      $$('[data-chist]', view).forEach(b => b.onclick = () => history(all.find(c => c.key === b.dataset.chist)));
      $$('[data-carch]', view).forEach(b => b.onclick = async () => { const c = all.find(x => x.key === b.dataset.carch); if (!c) return;
        if (await confirmBox(`Archive <b>${esc(c.name)}</b>? They will be hidden from the customer list. Their orders and payment history are kept.`, 'Yes, archive')) run(async () => { await api(`/customers/${c.key}/archive`, { method: 'POST', json: { name: c.name } }); c.archived = true; sel.delete(c.key); toast(`${c.name} archived ✓`); draw(); }); });
      $$('[data-crest]', view).forEach(b => b.onclick = () => run(async () => { const c = all.find(x => x.key === b.dataset.crest); await api(`/customers/${c.key}/restore`, { method: 'POST', json: {} }); c.archived = false; toast(`${c.name} restored ✓`); draw(); }));
      const cp = $('#ccopy'); if (cp) {
        cp.onclick = async () => { const t = picked.map(c => c.phone).join('\n'); try { await navigator.clipboard.writeText(t); toast(`${picked.length} phone numbers copied ✓`); } catch (e) { toast('Copy is blocked by the browser. Use the CSV download instead.', true); } };
        $('#ccsv').onclick = () => { const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"', rows = [['Name', 'Phone', 'Segment', 'Orders', 'Total spent', 'Last order'], ...picked.map(c => [c.name, c.phone, SEG[c.segment][0], c.orders, c.spent, d0(c.last_order)])];
          const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' })); a.download = 'aqualuxe-customers.csv'; a.click(); };
        $('#cclr').onclick = () => { sel.clear(); draw(); }; }
    };
    const history = c => run(async () => {
      const os = await api(`/customers/${c.key}/orders`);
      const m = modal(`${esc(c.name)} · order history`, `<p style="margin-bottom:12px;color:var(--muted)">${esc(c.phone)} · ${c.orders} orders · ${money(c.spent)} spent (cancelled orders not counted)</p><div class="tw"><table class="tbl"><thead><tr><th>Order</th><th>Date</th><th>Status</th><th class="r">Total</th><th>Advance</th></tr></thead><tbody>${os.map(o => `<tr class="click" data-oh="${o.id}"><td><b>${esc(o.order_no)}</b></td><td>${dt(o.created_at)}</td><td>${statusPill(o.status)}</td><td class="r">${money(o.total)}</td><td>${o.delivery_zone ? `${moneyX(o.advance_amount)} <small>(${esc(o.advance_status)})</small>` : '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No orders.</td></tr>'}</tbody></table></div>`, '<button class="btn line" data-x>Close</button>', 'wide');
      $$('[data-oh]', m).forEach(r => r.onclick = () => orderModal(r.dataset.oh));
    });
    $('#cq').oninput = e => { F.q = e.target.value.trim(); draw(); };
    $('#cseg').onchange = e => { F.seg = e.target.value; draw(); }; $('#cord').onchange = e => { F.ord = Number(e.target.value); draw(); };
    $('#cspent').oninput = e => { F.spent = e.target.value; draw(); }; $('#clast').onchange = e => { F.last = e.target.value; draw(); };
    $('#csort').onchange = e => { F.sort = e.target.value; draw(); }; $('#carch').onchange = e => { F.arch = e.target.checked; sel.clear(); draw(); };
    $('#call').onchange = e => { list().forEach(c => e.target.checked ? sel.add(c.key) : sel.delete(c.key)); draw(); };
    $('#creset').onclick = () => { Object.assign(F, { q: '', seg: '', ord: 0, spent: '', last: '', sort: 'spent', arch: false }); sel.clear(); ['cq', 'cseg', 'cord', 'cspent', 'clast', 'csort'].forEach(id => $('#' + id).value = id === 'cord' ? '0' : id === 'csort' ? 'spent' : ''); $('#carch').checked = false; draw(); };
    draw();
  },

  async messages() {
    const rows = await api('/messages');
    $('#view').innerHTML = rows.length ? rows.map(m => `<div class="card" style="margin-bottom:12px;${m.is_read ? 'opacity:.7' : 'border-left:4px solid var(--orange)'}"><h3><span>${esc(m.name)} <small>· ${esc(m.contact)} · ${dt(m.created_at)}</small></span><span><button class="btn sm line" data-msg-read="${m.id}">${m.is_read ? 'Mark unread' : 'Mark read'}</button> <button class="btn sm red" data-msg-del="${m.id}">Delete</button></span></h3><p style="white-space:pre-line">${esc(m.message)}</p></div>`).join('') : '<div class="card empty"><b>💬</b>No messages yet.</div>';
    $$('[data-msg-read]', $('#view')).forEach(b => b.onclick = () => run(async () => { const m = rows.find(x => x.id == b.dataset.msgRead); if (!m) return; await api('/messages/' + m.id, { method: 'PATCH', json: { is_read: !m.is_read } }); badges(); PAGES.messages(); }));
    $$('[data-msg-del]', $('#view')).forEach(b => b.onclick = async () => { if (await confirmBox('Delete this message?')) run(async () => { await api('/messages/' + b.dataset.msgDel, { method: 'DELETE' }); badges(); PAGES.messages(); }); });
  },

  async aichat() {
    const d = await api('/chat/summary');
    $('#view').innerHTML = `<div class="kpis">${kpi('Assistant mode', d.enabled ? 'AI' : 'No-AI', d.enabled ? 'AI service: ' + esc(d.provider) : 'Free mode (answers from your shop data). Add AI_API_KEY to .env for AI replies', '🤖', d.enabled ? 'g' : 'o')}${kpi('Chats (30 days)', d.conversations30, 'Visitors who talked to it', '💬', 'g')}${kpi('Questions asked', d.messages30, 'Last 30 days', '❓')}${kpi('Knowledge documents', d.documents, 'English + Bangla', '📚')}</div>
      <div class="card tw"><h3>Questions the assistant could not answer <small>review these and add knowledge or contact the customer</small></h3><table class="tbl"><thead><tr><th>Question</th><th>Topic</th><th>Date</th><th></th></tr></thead><tbody>${d.unknown.map(u => `<tr style="${u.human_review_needed ? '' : 'opacity:.55'}"><td style="max-width:420px">${esc(u.question)}${u.attempted_answer ? `<br><small style="color:var(--muted)">Bot said: ${esc(String(u.attempted_answer).slice(0, 140))}</small>` : ''}</td><td>${esc(u.intent || '')}</td><td>${dt(u.created_at)}</td><td><button class="btn sm line" data-uk="${u.id}" data-done="${u.human_review_needed ? 1 : 0}">${u.human_review_needed ? 'Mark reviewed' : 'Reopen'}</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Nothing logged yet. Questions the assistant could not answer safely will appear here.</td></tr>'}</tbody></table></div>`;
    $$('[data-uk]', $('#view')).forEach(b => b.onclick = () => run(async () => { await api('/chat/unknown/' + b.dataset.uk, { method: 'PATCH', json: { reviewed: b.dataset.done === '1' } }); PAGES.aichat(); }));
  },

  async settings() {
    const s = await api('/settings'), F = [['store_name', 'Store name'], ['phone', 'Phone (shown on website & bKash/Nagad note)'], ['whatsapp', 'WhatsApp number (880…, no + or spaces)'], ['email', 'Email'], ['address', 'Address'], ['announcement', 'Top banner message'], ['vip_spend', 'High-value customer: total spent at least (৳)'], ['loyal_orders', 'Loyal customer: at least this many orders']];
    $('#view').innerHTML = `<div class="cols eq"><form class="card fg" id="sf"><h3>Store settings</h3><div class="hint">Delivery charges are fixed by the payment rules: ৳${s.delivery_inside_dhaka || 90} inside Dhaka, ৳${s.delivery_outside_dhaka || 150} outside Dhaka.</div>${F.map(f => `<div><label class="l">${f[1]}</label><input class="inp" name="${f[0]}" value="${esc(s[f[0]])}"></div>`).join('')}<button class="btn">Save settings</button></form>
      <form class="card fg" id="pw" style="align-self:start"><h3>🔒 Change password</h3><div><label class="l">Current password</label><input class="inp" type="password" name="current" required></div><div><label class="l">New password (min 6 characters)</label><input class="inp" type="password" name="next" minlength="6" required></div><button class="btn">Update password</button></form></div>`;
    $('#sf').onsubmit = e => { e.preventDefault(); run(async () => { await api('/settings', { method: 'PUT', json: Object.fromEntries(new FormData(e.target)) }); toast('Settings saved ✓'); }); };
    $('#pw').onsubmit = e => { e.preventDefault(); run(async () => { await api('/change-password', { method: 'POST', json: Object.fromEntries(new FormData(e.target)) }); e.target.reset(); toast('Password changed ✓'); }); };
  }
};

/* ───────────────── shared dialogs ───────────────── */
const waNum = p => { p = String(p).replace(/\D/g, ''); return p.startsWith('880') ? p : '880' + p.replace(/^0/, ''); };
async function download(path, name) { const r = await api(path, { raw: true }); if (!r.ok) return toast('Download failed', true); const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; a.click(); }

async function orderModal(id, after) {
  const o = await api('/orders/' + id), STAT = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  const m = modal(`Order ${esc(o.order_no)} ${statusPill(o.status)}`, `
    <div class="fg c2" style="margin-bottom:18px"><div><label class="l">Customer</label><b>${esc(o.customer_name)}</b><br><a href="tel:${esc(o.customer_phone)}">📞 ${esc(o.customer_phone)}</a> · <a target="_blank" href="https://wa.me/${esc(waNum(o.customer_phone))}">💬 WhatsApp</a>${o.customer_email ? '<br>' + esc(o.customer_email) : ''}</div>
    <div><label class="l">Delivery address</label>${esc(o.customer_address)}${o.district ? '<br><b>' + esc(o.district) + '</b>' : ''}</div>
    <div><label class="l">Placed</label>${dt(o.created_at)}</div><div><label class="l">Payment</label><b>${esc(o.payment_method.toUpperCase())}</b></div></div>
    ${o.delivery_zone ? `<div class="payadm"><div><label class="l">Delivery area</label><b>${o.delivery_zone === 'inside_dhaka' ? 'Inside Dhaka' : 'Outside Dhaka'}</b></div><div><label class="l">Advance required</label><b>${moneyX(o.advance_amount)}</b></div><div><label class="l">Balance on delivery</label><b>${moneyX(o.balance_due)}</b></div>
      <div><label class="l">Advance status</label><span class="pill ${o.advance_status === 'verified' ? 'ok' : o.advance_status === 'submitted' ? 'confirmed' : 'pending'}">${o.advance_status === 'verified' ? 'Verified' : o.advance_status === 'submitted' ? 'TrxID submitted' : 'Not received'}</span>${o.advance_trx ? `<br><small>${esc(o.payment_method.toUpperCase())} TrxID: <b>${esc(o.advance_trx)}</b></small>` : ''}</div>
      <div class="payact">${o.advance_status === 'verified' ? '<button class="btn sm line" data-adv="submitted">Undo verification</button>' : '<button class="btn sm" data-adv="verified">✓ Mark advance as verified</button>'}</div></div>` : ''}
    ${o.notes ? `<div class="hint" style="background:#fff7e6;border-color:#f3dcab;color:#8a5a00">📝 ${esc(o.notes)}</div>` : ''}
    <table class="tbl"><thead><tr><th>Item</th><th class="r">Price</th><th class="r">Qty</th><th class="r">Total</th></tr></thead><tbody>${o.items.map(i => `<tr><td>${esc(i.product_name)}</td><td class="r">${money(i.price)}</td><td class="r">${i.qty}</td><td class="r">${money(i.price * i.qty)}</td></tr>`).join('')}
    <tr><td colspan="3" class="r">Delivery</td><td class="r">${money(o.shipping)}</td></tr><tr><td colspan="3" class="r"><b>Total</b></td><td class="r"><b style="font-size:1.1rem">${moneyX(o.total)}</b></td></tr></tbody></table>
    <div style="margin-top:18px"><label class="l">Change status</label><div class="seg" style="flex-wrap:wrap">${STAT.map(s => `<button data-st="${s}" class="${s === o.status ? 'on' : ''}" style="text-transform:capitalize">${s}</button>`).join('')}</div></div>`,
    `<button class="btn line" id="inv">🖨 Print invoice</button><button class="btn line" data-x>Close</button>`);
  $$('[data-adv]', m).forEach(b => b.onclick = () => run(async () => { await api(`/orders/${id}/advance`, { method: 'PATCH', json: { status: b.dataset.adv === 'submitted' && !o.advance_trx ? 'unpaid' : b.dataset.adv } }); m.remove(); toast('Advance payment status updated ✓'); if (after) after(); orderModal(id, after); }));
  $$('[data-st]', m).forEach(b => b.onclick = async () => { if (b.dataset.st === o.status) return; if (b.dataset.st === 'cancelled' && !await confirmBox('Cancel this order? The stock will be put back.', 'Yes, cancel order')) return; run(async () => { await api(`/orders/${id}/status`, { method: 'PATCH', json: { status: b.dataset.st } }); m.remove(); toast('Status updated ✓'); badges(); if (after) after(); else if (location.hash === '#dashboard' || !location.hash) route(); }); });
  $('#inv', m).onclick = () => { const w = window.open('', '_blank'); w.document.write(`<html><head><title>Invoice ${esc(o.order_no)}</title><style>body{font-family:Arial;padding:30px;max-width:720px;margin:auto}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}.r{text-align:right}h1{margin:0}</style></head><body><h1>🌿 AquaLuxe</h1><p>Invoice <b>${esc(o.order_no)}</b> · ${d0(o.created_at)}</p><p><b>${esc(o.customer_name)}</b><br>${esc(o.customer_phone)}<br>${esc(o.customer_address)} ${esc(o.district || '')}</p><table><tr><th>Item</th><th class="r">Price</th><th class="r">Qty</th><th class="r">Total</th></tr>${o.items.map(i => `<tr><td>${esc(i.product_name)}</td><td class="r">${money(i.price)}</td><td class="r">${i.qty}</td><td class="r">${money(i.price * i.qty)}</td></tr>`).join('')}<tr><td colspan="3" class="r">Delivery</td><td class="r">${money(o.shipping)}</td></tr><tr><td colspan="3" class="r"><b>Total</b></td><td class="r"><b>${moneyX(o.total)}</b></td></tr>${o.delivery_zone ? `<tr><td colspan="3" class="r">Advance (${esc(o.advance_status)})</td><td class="r">${moneyX(o.advance_amount)}</td></tr><tr><td colspan="3" class="r"><b>Balance on delivery</b></td><td class="r"><b>${moneyX(o.balance_due)}</b></td></tr>` : ''}</table><p>Payment: ${esc(o.payment_method.toUpperCase())}</p><p style="color:#777">Thank you for shopping with AquaLuxe!</p><script>print()<\/script></body></html>`); w.document.close(); };
}

function productForm(p) {
  p = p || { name: '', category_id: '', price: '', old_price: '', cost_price: '', stock: 0, low_stock_alert: 5, description: '', how_to_use: '', is_active: 1, is_featured: 0, image: null }; let file = null, removeImg = false;
  const m = modal(p.id ? 'Edit product' : 'Add new product', `<form id="pf" class="fg">
    <div><label class="l">Product photo <small>(drag a picture here, or click to choose)</small></label><div class="drop" id="drop"><div id="dp">${p.image ? `<img src="${esc(p.image)}">` : '<div><div style="font-size:2.4rem">📷</div><b>Drop picture here</b>or click to browse (max 5 MB)</div>'}</div><input type="file" id="fi" accept="image/*" hidden></div></div>
    <div><label class="l">Product name *</label><input class="inp" name="name" required value="${esc(p.name)}"></div>
    <div class="fg c2"><div><label class="l">Category</label><select class="sel" name="category_id"><option value="">— none —</option>${CATS.map(c => `<option value="${c.id}" ${c.id == p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div><div><label class="l">Stock quantity</label><input class="inp" type="number" min="0" name="stock" value="${p.stock}"></div></div>
    <div class="fg c3"><div><label class="l">Selling price (৳) *</label><input class="inp" type="number" min="0" step="0.01" name="price" required value="${p.price}"></div><div><label class="l">Old price <small>(for sale tag)</small></label><input class="inp" type="number" min="0" step="0.01" name="old_price" value="${p.old_price || ''}"></div><div><label class="l">Cost price (৳) <small>(your buying price)</small></label><input class="inp" type="number" min="0" step="0.01" name="cost_price" value="${p.cost_price}"></div></div>
    <div><label class="l">Description</label><textarea class="inp" name="description">${esc(p.description)}</textarea></div><div><label class="l">How to use / care</label><textarea class="inp" name="how_to_use">${esc(p.how_to_use)}</textarea></div>
    <div class="fg c3"><div><label class="l">Low-stock alert at</label><input class="inp" type="number" min="0" name="low_stock_alert" value="${p.low_stock_alert}"></div><label class="chk" style="margin-top:22px"><input type="checkbox" name="is_active" ${p.is_active ? 'checked' : ''}> Show on website</label><label class="chk" style="margin-top:22px"><input type="checkbox" name="is_featured" ${p.is_featured ? 'checked' : ''}> Featured ⭐</label></div></form>`,
    `<button class="btn line" data-x>Cancel</button><button class="btn" id="save">${p.id ? 'Save changes' : 'Add product'}</button>`);
  const drop = $('#drop', m), fi = $('#fi', m), show = f => { file = f; removeImg = false; $('#dp', m).innerHTML = `<img src="${URL.createObjectURL(f)}">`; };
  drop.onclick = () => fi.click(); fi.onchange = () => fi.files[0] && show(fi.files[0]);
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); })); ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) show(f); else toast('Please drop an image file', true); });
  $('#save', m).onclick = () => { const f = $('#pf', m); if (!f.reportValidity()) return; const fd = new FormData(f);
    fd.set('is_active', f.is_active.checked ? '1' : '0'); fd.set('is_featured', f.is_featured.checked ? '1' : '0'); if (file) fd.set('image', file);
    run(async () => { await api(p.id ? '/products/' + p.id : '/products', { method: p.id ? 'PUT' : 'POST', body: fd }); m.remove(); toast(p.id ? 'Product updated ✓' : 'Product added ✓'); if (window.refreshProducts && location.hash === '#products') refreshProducts(); }); };
}

async function badges() {
  try { const [o, msgs] = await Promise.all([api('/orders?status=pending'), api('/messages')]); const p = $('#cPend'), c = $('#cMsg'), un = msgs.filter(x => !x.is_read).length;
    p.textContent = o.length; p.style.display = o.length ? '' : 'none'; c.textContent = un; c.style.display = un ? '' : 'none'; } catch (e) {}
}

$$('.nv[data-r]').forEach(a => a.addEventListener('click', () => { location.hash = a.dataset.r; }));
$('#logout').onclick = logout; $('#menu').onclick = () => $('#side').classList.toggle('on'); $('#who').textContent = '👤 ' + (localStorage.getItem('aq_admin_name') || 'Admin');
window.addEventListener('hashchange', route); route(); badges();

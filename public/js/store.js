/* AquaLuxe storefront - one small script shared by every page */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '৳' + Math.round(Number(n) || 0).toLocaleString('en-US');
const moneyX = n => { n = Number(n) || 0; return '৳' + (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })); };
async function api(url, opts) {
  const r = await fetch(url, opts); let d = {};
  try { d = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
  return d;
}
let S = {}; const cache = {};
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2400); }

/* ───────── Cart (saved in this browser) ───────── */
const Cart = {
  items: JSON.parse(localStorage.getItem('aq_cart') || '[]'),
  save() { localStorage.setItem('aq_cart', JSON.stringify(this.items)); renderCart(); },
  add(p, qty = 1) {
    const it = this.items.find(i => i.id === p.id), have = it ? it.qty : 0;
    if (p.stock <= 0) return toast('Sorry, this item is sold out.');
    if (have + qty > p.stock) return toast(`Only ${p.stock} available in stock.`);
    if (it) { it.qty += qty; it.stock = p.stock; } else this.items.push({ id: p.id, name: p.name, price: p.price, image: p.image, icon: p.category_icon, stock: p.stock, qty });
    this.save(); toast('Added to cart ✓');
  },
  setQty(id, q) { const it = this.items.find(i => i.id === id); if (!it) return; if (q < 1) return this.remove(id); if (q > it.stock) { toast(`Only ${it.stock} available.`); q = it.stock; } it.qty = q; this.save(); },
  remove(id) { this.items = this.items.filter(i => i.id !== id); this.save(); },
  clear() { this.items = []; this.save(); },
  count() { return this.items.reduce((a, i) => a + i.qty, 0); },
  subtotal() { return this.items.reduce((a, i) => a + i.price * i.qty, 0); }
};
/* ───────── Delivery + advance rules (display only – the server recalculates everything from the database) ───────── */
function calcPay(sub, district) {
  if (!district) return null;
  const inside = district === 'Dhaka', ship = Number(inside ? S.delivery_inside_dhaka : S.delivery_outside_dhaka) || (inside ? 90 : 150), total = sub + ship;
  const advance = Math.min(total, inside ? ship : Math.round(sub * 50) / 100);
  return { zone: inside ? 'inside_dhaka' : 'outside_dhaka', subtotal: sub, shipping: ship, total, advance, balance: Math.round((total - advance) * 100) / 100 };
}
const PAY_NOTICE = 'Inside Dhaka: ৳90 delivery charge must be paid in advance. Outside Dhaka: 50% of the product total must be paid in advance. Delivery charge is ৳150. Please follow the payment instructions to confirm your order.';
const ADV_STATUS = { unpaid: ['warn', 'Advance not received yet'], submitted: ['info', 'Transaction ID received – we are verifying your payment'], verified: ['ok', 'Advance payment verified ✓'] };
function payBox(o) {
  const inside = o.zone === 'inside_dhaka', via = o.payment_method === 'nagad' ? 'Nagad' : 'bKash', st = ADV_STATUS[o.advance_status] || ADV_STATUS.unpaid;
  return `<div class="paybox"><div class="pb-head"><h3>💳 Transaction &amp; Payment Summary</h3><span class="pb-st ${st[0]}" data-pbst>${st[1]}</span></div>
    <div class="pb-ids"><div><small>Order ID</small><b>${esc(o.order_no)}</b></div><div><small>Confirmation code</small><b>${esc(o.order_no)}</b></div></div>
    <div class="pb-rows">
      <div><span>Product subtotal</span><b>${moneyX(o.subtotal)}</b></div>
      <div><span>Delivery · ${inside ? 'Inside Dhaka' : 'Outside Dhaka'}${o.district ? ' (' + esc(o.district) + ')' : ''}</span><b>${moneyX(o.shipping)}</b></div>
      <div class="tot"><span>Total order amount</span><b>${moneyX(o.total)}</b></div>
      <div class="adv"><span>Advance to pay now<small>${inside ? 'Delivery charge, paid in advance' : '50% of the product subtotal'}</small></span><b>${moneyX(o.advance)}</b></div>
      <div class="bal"><span>Remaining balance<small>Cash on delivery</small></span><b>${moneyX(o.balance)}</b></div>
    </div>
    <div class="pb-how"><b>How to pay the advance</b><ol><li>Open <b>${via}</b> and choose <b>Send Money</b>.</li><li>Send <b>${moneyX(o.advance)}</b> to <b>${esc(S.phone || '')}</b> (personal number).</li><li>Use <b>${esc(o.order_no)}</b> as the reference.</li><li>Enter the Transaction ID below so we can verify it.</li></ol></div>
    ${o.advance_status === 'verified' ? '' : `<form class="pb-trx" data-pbtrx><input class="field" name="trx_id" placeholder="Transaction ID (e.g. 9H7K2LMN)" required minlength="4" maxlength="40" autocomplete="off"><button class="btn sm" type="submit">Submit</button></form><div class="pb-msg" data-pbmsg></div>`}
    <p class="pb-note">${PAY_NOTICE}</p></div>`;
}
function bindTrx(root, o, phone) {
  const f = $('[data-pbtrx]', root); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault(); const b = $('button', f), m = $('[data-pbmsg]', root); b.disabled = true;
    try { await api('/api/orders/trx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_no: o.order_no, phone, trx_id: f.trx_id.value }) });
      const s = $('[data-pbst]', root); s.className = 'pb-st info'; s.textContent = ADV_STATUS.submitted[1]; m.className = 'pb-msg ok'; m.textContent = 'Thank you! We will verify your payment shortly.'; }
    catch (ex) { m.className = 'pb-msg err'; m.textContent = ex.message; } b.disabled = false;
  };
}
const thumb = (i, cls = '') => i.image ? `<img src="${esc(i.image)}" alt="" loading="lazy">` : `<div class="ph ${cls}">${esc(i.icon || '🐟')}</div>`;

function renderCart() {
  const n = Cart.count(), b = $('#cartBadge'); if (b) { b.textContent = n; b.style.display = n ? 'grid' : 'none'; }
  const box = $('#cartItems'); if (!box) return;
  const sub = Cart.subtotal();
  if (!Cart.items.length) { box.innerHTML = `<div class="empty"><b>🛒</b>Your cart is empty.<br><br><a class="btn sm" href="/shop.html">Start shopping</a></div>`; $('#cartFoot').style.display = 'none'; return; }
  $('#cartFoot').style.display = 'block';
  box.innerHTML = Cart.items.map(i => `<div class="ci"><div class="th">${thumb(i)}</div><div><b>${esc(i.name)}</b><small>${money(i.price)}</small>
    <div class="qty"><button data-q="${i.id}" data-d="-1">−</button><span>${i.qty}</span><button data-q="${i.id}" data-d="1">+</button></div></div>
    <div style="text-align:right"><b>${money(i.price * i.qty)}</b><br><button class="rm" data-rm="${i.id}" title="Remove">🗑</button></div></div>`).join('');
  $('#shipMsg').innerHTML = `Delivery: <b style="color:var(--green)">${money(S.delivery_inside_dhaka || 90)}</b> inside Dhaka · <b style="color:var(--green)">${money(S.delivery_outside_dhaka || 150)}</b> outside Dhaka`;
  $('#cSub').textContent = money(sub);
}
const openCart = on => { $('#drawer').classList.toggle('on', on); $('#overlay').classList.toggle('on', on); };

/* ───────── Shared layout (header + footer on every page) ───────── */
function layout() {
  const page = document.body.dataset.page, nav = [['/', 'Home', 'home'], ['/shop.html', 'Shop', 'shop'], ['/about.html', 'Our Story', 'about'], ['/aquascapes.html', 'Aquascapes', 'aquascapes'], ['/contact.html', 'Contact', 'contact']];
  const svgS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  document.body.insertAdjacentHTML('afterbegin', `
  <div class="announce">${esc(S.announcement || '')}</div>
  <header class="site"><div class="wrap nav">
    <button class="icon-btn burger" id="burger" aria-label="Menu">☰</button>
    <a class="logo" href="/">🌿 Aqua<b>Luxe</b></a>
    <nav class="nav-links" id="navLinks">${nav.map(n => `<a href="${n[0]}" class="${n[2] === page || (page === 'product' && n[2] === 'shop') ? 'on' : ''}">${n[1]}</a>`).join('')}</nav>
    <form class="search" id="searchForm">${svgS}<input id="hSearch" placeholder="Search plants, fish, lights…" autocomplete="off"></form>
    <button class="icon-btn searchbtn" id="searchBtn" aria-label="Search">${svgS}</button>
    <a class="icon-btn" href="/track.html" title="Track your order">📦</a>
    <button class="icon-btn" id="cartBtn" aria-label="Cart"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6h15l-1.5 9h-12z"/><path d="M6 6 5 3H2"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg><span class="badge" id="cartBadge">0</span></button>
  </div></header>
  <div class="overlay" id="overlay"></div>
  <aside class="drawer" id="drawer"><header><h3>Your Cart</h3><button class="x" id="closeCart">×</button></header>
    <div class="items" id="cartItems"></div>
    <footer id="cartFoot"><div id="shipMsg" style="font-size:.88rem;color:var(--muted);margin-bottom:12px"></div>
      <div class="sum-row t"><span>Subtotal</span><span id="cSub"></span></div><a class="btn block" href="/checkout.html">Checkout →</a></footer></aside>
  <div class="toast" id="toast"></div><div class="lightbox" id="lightbox"><img alt=""></div>`);
  document.body.insertAdjacentHTML('beforeend', `
  <footer class="site"><div class="wrap"><div class="foot">
    <div><a class="logo" href="/">🌿 Aqua<b>Luxe</b></a><p style="margin-top:14px;max-width:300px">Premium aquarium fish, aquatic plants and aquascaping supplies, delivered all over Bangladesh.</p></div>
    <div><h4>Shop</h4><a href="/shop.html?category=aquatic-plants">Aquatic Plants</a><a href="/shop.html?category=aquarium-fish">Aquarium Fish</a><a href="/shop.html?category=bogwood-driftwood">Bogwood & Driftwood</a><a href="/shop.html?category=aquarium-lights">Aquarium Lights</a><a href="/shop.html">All Products</a></div>
    <div><h4>Help</h4><a href="/track.html">Track My Order</a><a href="/about.html">Our Story</a><a href="/aquascapes.html">Aquascapes</a><a href="/contact.html">Contact Us</a></div>
    <div><h4>Contact</h4><p>📍 ${esc(S.address)}</p><p>📞 ${esc(S.phone)}</p><p>✉️ ${esc(S.email)}</p><p>We accept: Cash on Delivery · bKash · Nagad</p></div>
  </div><div class="copy"><span>© ${new Date().getFullYear()} ${esc(S.store_name || 'AquaLuxe')}. All rights reserved.</span><span>Made with 💚 for aquarium lovers</span></div></div></footer>
  <a class="wa-float" target="_blank" rel="noopener" href="https://wa.me/${esc(S.whatsapp)}?text=Hello%20AquaLuxe!" title="Chat on WhatsApp"><span style="font-size:1.7rem">💬</span></a>`);
  $('#cartBtn').onclick = () => openCart(true); $('#closeCart').onclick = $('#overlay').onclick = () => { openCart(false); $('#navLinks').classList.remove('on'); };
  $('#burger').onclick = () => { $('#navLinks').classList.add('on'); $('#overlay').classList.add('on'); };
  $('#searchBtn').onclick = () => { $('#searchForm').classList.toggle('on'); $('#hSearch').focus(); };
  $('#searchForm').onsubmit = e => { e.preventDefault(); location.href = '/shop.html?q=' + encodeURIComponent($('#hSearch').value.trim()); };
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-add]'); if (a) { e.preventDefault(); const p = cache[a.dataset.add]; if (p) Cart.add(p); }
    const q = e.target.closest('[data-q]'); if (q) { const it = Cart.items.find(i => i.id == q.dataset.q); if (it) Cart.setQty(it.id, it.qty + Number(q.dataset.d)); }
    const r = e.target.closest('[data-rm]'); if (r) Cart.remove(Number(r.dataset.rm));
  });
  renderCart();
}

/* ───────── Product card ───────── */
function card(p) {
  cache[p.id] = p; const sold = p.stock <= 0, low = !sold && p.stock <= 5, off = p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
  return `<article class="card"><a class="img" href="/product.html?id=${p.id}">${thumb(p)}
    <div class="tags">${off ? `<span class="tag">-${off}%</span>` : ''}${sold ? '<span class="tag red">Sold out</span>' : low ? '<span class="tag dark">Only ' + p.stock + ' left</span>' : ''}</div></a>
    <div class="body"><span class="cat-name">${esc(p.category || '')}</span><a href="/product.html?id=${p.id}"><h3>${esc(p.name)}</h3></a>
    <div class="row"><div class="price">${money(p.price)}${off ? `<s>${money(p.old_price)}</s>` : ''}</div>
    <button class="add" data-add="${p.id}" ${sold ? 'disabled' : ''}>${sold ? 'Sold out' : '+ Add'}</button></div></div></article>`;
}
const skeletons = n => Array(n).fill('<div class="skel"></div>').join('');

/* ───────── Pages ───────── */
const PAGES = {
  async home() {
    $('#featured').innerHTML = skeletons(4); $('#newest').innerHTML = skeletons(4);
    const [cats, feat, news] = await Promise.all([api('/api/categories'), api('/api/products?featured=1&limit=8'), api('/api/products?sort=newest&limit=8')]);
    $('#cats').innerHTML = cats.map(c => `<a class="cat" href="/shop.html?category=${c.slug}"><span class="ico">${c.icon}</span><span><b>${esc(c.name)}</b><small>${c.count} product${c.count == 1 ? '' : 's'}</small></span></a>`).join('');
    $('#featured').innerHTML = feat.length ? feat.map(card).join('') : '<div class="empty">No featured products yet.</div>';
    $('#newest').innerHTML = news.map(card).join('');
  },

  async shop() {
    const P = new URLSearchParams(location.search), st = { category: P.get('category') || '', q: P.get('q') || '', sort: P.get('sort') || '', min: '', max: '', instock: false };
    const cats = await api('/api/categories'), total = cats.reduce((a, c) => a + c.count, 0);
    const side = $('#filters');
    side.innerHTML = `<div class="grp"><h4>Categories</h4><div id="fcats"></div></div>
      <div class="grp"><h4>Price (৳)</h4><div class="price-row"><input type="number" id="pmin" placeholder="Min" min="0"><span>–</span><input type="number" id="pmax" placeholder="Max" min="0"></div></div>
      <div class="grp"><label class="check"><input type="checkbox" id="instock"> In stock only</label></div>
      <button class="btn ghost block sm" id="reset">Clear filters</button>`;
    const drawCats = () => $('#fcats').innerHTML = `<div class="fcat ${!st.category ? 'on' : ''}" data-c=""><span>All products</span><small>${total}</small></div>` + cats.map(c => `<div class="fcat ${st.category === c.slug ? 'on' : ''}" data-c="${c.slug}"><span>${c.icon} ${esc(c.name)}</span><small>${c.count}</small></div>`).join('');
    async function load() {
      drawCats(); $('#sq').value = st.q; $('#sort').value = st.sort;
      const cat = cats.find(c => c.slug === st.category);
      $('#title').textContent = cat ? cat.name : st.q ? `Results for “${st.q}”` : 'All Products';
      $('#crumb').innerHTML = `<a href="/">Home</a> / <a href="/shop.html">Shop</a>${cat ? ' / ' + esc(cat.name) : ''}`;
      const qs = new URLSearchParams(); if (st.category) qs.set('category', st.category); if (st.q) qs.set('q', st.q); if (st.sort) qs.set('sort', st.sort); if (st.min) qs.set('min', st.min); if (st.max) qs.set('max', st.max); if (st.instock) qs.set('instock', 1);
      history.replaceState(null, '', '?' + [...qs].filter(([k]) => ['category', 'q', 'sort'].includes(k)).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&'));
      $('#grid').innerHTML = skeletons(6);
      const list = await api('/api/products?' + qs);
      $('#count').textContent = `${list.length} product${list.length == 1 ? '' : 's'}`;
      $('#grid').innerHTML = list.length ? list.map(card).join('') : '<div class="empty"><b>🔍</b>No products found.<br>Try another category or clear the filters.</div>';
    }
    side.onclick = e => { const c = e.target.closest('[data-c]'); if (c) { st.category = c.dataset.c; load(); } };
    let t; $('#sq').oninput = e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); load(); }, 350); };
    $('#sort').onchange = e => { st.sort = e.target.value; load(); };
    $('#pmin').onchange = e => { st.min = e.target.value; load(); }; $('#pmax').onchange = e => { st.max = e.target.value; load(); };
    $('#instock').onchange = e => { st.instock = e.target.checked; load(); };
    $('#reset').onclick = () => { Object.assign(st, { category: '', q: '', sort: '', min: '', max: '', instock: false }); $('#pmin').value = $('#pmax').value = ''; $('#instock').checked = false; load(); };
    $('#ftoggle').onclick = () => side.classList.toggle('on');
    load();
  },

  async product() {
    const id = new URLSearchParams(location.search).get('id'), box = $('#pd');
    let p; try { p = await api('/api/products/' + encodeURIComponent(id)); } catch (e) { box.innerHTML = '<div class="empty"><b>😕</b>Product not found.<br><br><a class="btn sm" href="/shop.html">Back to shop</a></div>'; return; }
    cache[p.id] = p; document.title = p.name + ' – AquaLuxe';
    const off = p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0, sold = p.stock <= 0, low = !sold && p.stock <= 5; let qty = 1;
    $('#crumb').innerHTML = `<a href="/">Home</a> / <a href="/shop.html">Shop</a> / <a href="/shop.html?category=${esc(p.category_slug)}">${esc(p.category || '')}</a> / ${esc(p.name)}`;
    box.innerHTML = `<div class="pic">${thumb(p)}</div><div>
      <div class="eyebrow">${esc(p.category || '')}</div><h1>${esc(p.name)}</h1>
      <div class="big">${money(p.price)}${off ? `<s>${money(p.old_price)}</s> <span class="tag" style="vertical-align:middle">-${off}%</span>` : ''}</div>
      <div class="stock ${sold ? 'out' : low ? 'low' : ''}">${sold ? 'Out of stock' : low ? 'Only ' + p.stock + ' left – order soon' : 'In stock'}</div>
      <p style="color:#c9d1cb">${esc((p.description || '').split('\n')[0])}</p>
      <div class="buy-row"><div class="qty"><button id="qm">−</button><span id="qv">1</span><button id="qp">+</button></div>
        <button class="btn" id="addBtn" ${sold ? 'disabled' : ''}>🛒 Add to Cart</button><button class="btn orange" id="buyBtn" ${sold ? 'disabled' : ''}>Buy Now</button></div>
      <div class="perks"><span>🚚 Delivery all over Bangladesh (Dhaka 1–2 days)</span><span>💵 Cash on Delivery, bKash &amp; Nagad accepted</span><span>🌱 Healthy, carefully packed – live items packed with care</span></div></div>`;
    $('#qm').onclick = () => { qty = Math.max(1, qty - 1); $('#qv').textContent = qty; };
    $('#qp').onclick = () => { qty = Math.min(p.stock || 1, qty + 1); $('#qv').textContent = qty; };
    $('#addBtn').onclick = () => Cart.add(p, qty); $('#buyBtn').onclick = () => { Cart.add(p, qty); location.href = '/checkout.html'; };
    const panes = { Description: p.description, 'How to use / care': p.how_to_use, Delivery: 'Orders are confirmed by phone, packed the same day and delivered by courier.\nDhaka: 1–2 working days · Outside Dhaka: 2–4 working days.\nLive fish and plants are packed carefully for safe travel. Please check your parcel on delivery and call us right away if anything is wrong.' };
    const draw = k => { $('#tabs').innerHTML = Object.keys(panes).map(n => `<button class="${n === k ? 'on' : ''}" data-t="${n}">${n}</button>`).join(''); $('#pane').textContent = panes[k] || 'Details coming soon.'; };
    draw('Description'); $('#tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) draw(b.dataset.t); };
    if (p.category_slug) { const rel = (await api('/api/products?category=' + p.category_slug + '&limit=5')).filter(x => x.id !== p.id).slice(0, 4); if (rel.length) { $('#related').style.display = 'block'; $('#relGrid').innerHTML = rel.map(card).join(''); } }
  },

  checkout() {
    const DIST = 'Dhaka,Gazipur,Narayanganj,Narsingdi,Munshiganj,Manikganj,Tangail,Kishoreganj,Faridpur,Gopalganj,Madaripur,Rajbari,Shariatpur,Chattogram,Cox\'s Bazar,Cumilla,Brahmanbaria,Chandpur,Noakhali,Feni,Lakshmipur,Khagrachhari,Rangamati,Bandarban,Sylhet,Moulvibazar,Habiganj,Sunamganj,Rajshahi,Bogura,Pabna,Sirajganj,Natore,Naogaon,Chapainawabganj,Joypurhat,Khulna,Jashore,Satkhira,Bagerhat,Kushtia,Magura,Narail,Chuadanga,Meherpur,Jhenaidah,Barishal,Bhola,Patuakhali,Pirojpur,Jhalokati,Barguna,Rangpur,Dinajpur,Kurigram,Gaibandha,Lalmonirhat,Nilphamari,Thakurgaon,Panchagarh,Mymensingh,Jamalpur,Netrokona,Sherpur'.split(',');
    $('#district').innerHTML = '<option value="">Select district</option>' + DIST.map(d => `<option>${d}</option>`).join('');
    const sum = () => {
      if (!$('#district')) return;   // checkout form is replaced by the confirmation after ordering
      const sub = Cart.subtotal(), p = calcPay(sub, $('#district').value);
      $('#mini').innerHTML = Cart.items.map(i => `<div class="mini">${thumb(i)}<div><b>${esc(i.name)}</b><br><small>${money(i.price)} × ${i.qty}</small></div><b>${money(i.price * i.qty)}</b></div>`).join('') || '<p style="color:var(--muted)">Your cart is empty. <a href="/shop.html" style="color:var(--green)">Go shopping</a></p>';
      $('#sSub').textContent = moneyX(sub); $('#sShip').textContent = p ? moneyX(p.shipping) : 'Select district'; $('#sZone').textContent = p ? (p.zone === 'inside_dhaka' ? 'Inside Dhaka' : 'Outside Dhaka') : '';
      $('#sTot').textContent = moneyX(p ? p.total : sub); $('#sAdv').textContent = p ? moneyX(p.advance) : '—'; $('#sBal').textContent = p ? moneyX(p.balance) : '—'; $('#place').disabled = !Cart.items.length; note();
    };
    document.addEventListener('click', () => setTimeout(sum, 0)); $('#district').onchange = sum;
    function note() { const m = document.querySelector('input[name=payment_method]:checked').value, p = calcPay(Cart.subtotal(), $('#district').value), n = $('#payNote'); n.classList.add('on');
      n.innerHTML = p ? `Advance to pay now: <b style="color:var(--green)">${moneyX(p.advance)}</b>. Please <b>Send Money</b> to <b>${esc(S.phone)}</b> (personal number) using ${m === 'bkash' ? 'bKash' : 'Nagad'}. You can enter the Transaction ID now or on the next page. The remaining <b>${moneyX(p.balance)}</b> is paid in cash on delivery.<br><small style="color:var(--muted)">${PAY_NOTICE}</small>` : `Select your district to see the advance amount.<br><small style="color:var(--muted)">${PAY_NOTICE}</small>`; }
    $$('input[name=payment_method]').forEach(r => r.onchange = note); sum();
    $('#coForm').onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target), err = $('#err'), btn = $('#place'); err.style.display = 'none'; btn.disabled = true; btn.textContent = 'Placing order…';
      try {
        const r = await api('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer: Object.fromEntries(f), items: Cart.items.map(i => ({ id: i.id, qty: i.qty })) }) });
        Cart.clear();
        $('#coWrap').innerHTML = `<div class="done"><div class="tick">✓</div><h1>Thank you, order placed!</h1><p style="color:var(--muted)">Pay the advance below to confirm your order. We will also call you.</p>
          <div class="ono" id="ono">${esc(r.order_no)}</div>
          ${payBox({ ...r, order_no: r.order_no })}
          <p style="color:var(--muted);font-size:.9rem;margin:18px 0 26px">Save your order number. Use it with your phone number to track the order.</p>
          <a class="btn" href="/track.html?no=${r.order_no}">Track my order</a> <a class="btn ghost" href="/shop.html">Continue shopping</a></div>`;
        bindTrx($('#coWrap'), r, f.get('phone'));
        scrollTo(0, 0);
      } catch (ex) { err.textContent = ex.message; err.style.display = 'block'; btn.disabled = false; btn.textContent = 'Place Order'; scrollTo({ top: 120, behavior: 'smooth' }); }
    };
  },

  track() {
    const P = new URLSearchParams(location.search); $('#tno').value = P.get('no') || '';
    $('#trForm').onsubmit = async e => {
      e.preventDefault(); const out = $('#trOut'); out.innerHTML = '';
      try {
        const o = await api(`/api/orders/track?order_no=${encodeURIComponent($('#tno').value)}&phone=${encodeURIComponent($('#tph').value)}`);
        const steps = [['pending', '📝', 'Order placed'], ['confirmed', '✅', 'Confirmed'], ['shipped', '🚚', 'On the way'], ['delivered', '🏠', 'Delivered']], at = steps.findIndex(s => s[0] === o.status);
        out.innerHTML = `<div class="box" style="margin-top:24px"><h3>Order ${esc(o.order_no)}</h3>
          ${o.status === 'cancelled' ? '<div class="msg err">This order was cancelled. Please contact us if you need help.</div>' : `<div class="timeline">${steps.map((s, i) => `<div class="tl ${i <= at ? 'on' : ''}"><i>${s[1]}</i>${s[2]}</div>`).join('')}</div>`}
          ${o.items.map(i => `<div class="mini"><div>${esc(i.product_name)}<br><small>${money(i.price)} × ${i.qty}</small></div><b>${money(i.price * i.qty)}</b></div>`).join('')}
          ${o.zone ? '' : `<div class="sum-row" style="margin-top:12px"><span>Delivery</span><span>${o.shipping ? money(o.shipping) : 'FREE'}</span></div><div class="sum-row t"><span>Total</span><span>${money(o.total)}</span></div>`}</div>${o.zone && o.status !== 'cancelled' ? payBox(o) : ''}`;
        bindTrx(out, o, $('#tph').value);
      } catch (ex) { out.innerHTML = `<div class="msg err" style="margin-top:20px">${esc(ex.message)}</div>`; }
    };
    if (P.get('no')) $('#tph').focus();
  },

  aquascapes() {
    const lb = $('#lightbox'); $$('.gal figure').forEach(f => f.onclick = () => { $('img', lb).src = $('img', f).src; lb.classList.add('on'); }); lb.onclick = () => lb.classList.remove('on');
  },

  contact() {
    $('#ctForm').onsubmit = async e => {
      e.preventDefault(); const m = $('#ctMsg');
      try { await api('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(e.target))) }); e.target.reset(); m.className = 'msg ok'; m.textContent = 'Thank you! Your message was sent. We will reply soon.'; }
      catch (ex) { m.className = 'msg err'; m.textContent = ex.message; } m.style.display = 'block';
    };
    $('#ctInfo').innerHTML = `<div class="ci2"><i>📍</i><div><b>Visit / Address</b><span>${esc(S.address)}</span></div></div><div class="ci2"><i>📞</i><div><b>Call us</b><span>${esc(S.phone)}</span></div></div>
      <div class="ci2"><i>💬</i><div><b>WhatsApp</b><span><a target="_blank" rel="noopener" style="color:var(--green)" href="https://wa.me/${esc(S.whatsapp)}">Chat with us now</a></span></div></div><div class="ci2"><i>✉️</i><div><b>Email</b><span>${esc(S.email)}</span></div></div>
      <div class="ci2"><i>🕘</i><div><b>Open hours</b><span>Every day, 10:00 AM – 9:00 PM</span></div></div>`;
  }
};

(async function start() {
  try { S = await api('/api/settings'); } catch (e) {}
  layout();
  const fn = PAGES[document.body.dataset.page]; if (fn) try { await fn(); } catch (e) { console.error(e); toast(e.message); }
})();

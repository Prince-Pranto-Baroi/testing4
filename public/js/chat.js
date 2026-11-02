/* AquaLuxe AI chat widget – floating button + chat window. Loaded after store.js (uses its esc, money, Cart helpers). */
(function () {
  const KEY = 'aq_chat', MAX_KEEP = 40;
  let st = { sid: '', cid: null, msgs: [] }, busy = false, open = false;
  try { st = Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
  if (!/^[a-zA-Z0-9-]{16,64}$/.test(st.sid || '')) st.sid = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ sid: st.sid, cid: st.cid, msgs: st.msgs.slice(-MAX_KEEP) })); } catch (e) {} };
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mon = n => '৳' + Math.round(Number(n) || 0).toLocaleString('en-US');

  // very small, safe formatter: **bold**, bullet/numbered lines, links, line breaks (everything is escaped first)
  function fmt(t) {
    let h = E(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    const out = []; let list = null;
    for (const line of h.split('\n')) {
      const m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (m) { const tag = /^\s*\d/.test(line) ? 'ol' : 'ul'; if (list !== tag) { if (list) out.push(`</${list}>`); out.push(`<${tag}>`); list = tag; } out.push(`<li>${m[1]}</li>`); }
      else { if (list) { out.push(`</${list}>`); list = null; } out.push(line.trim() ? `<p>${line}</p>` : ''); }
    }
    if (list) out.push(`</${list}>`); return out.join('');
  }
  const cardHtml = p => `<div class="cb-card"><div class="cb-th">${p.image ? `<img src="${E(p.image)}" alt="" loading="lazy">` : E(p.category_icon || '🐟')}</div>
    <div class="cb-ci"><b>${E(p.name)}</b><span>${mon(p.price)}${p.old_price ? ` <s>${mon(p.old_price)}</s>` : ''}${p.stock <= 0 ? ' · <em>sold out</em>' : p.stock <= 5 ? ` · <em>only ${p.stock} left</em>` : ''}</span>
    <div class="cb-act"><a href="/product.html?id=${p.id}">View</a>${p.stock > 0 ? `<button data-cbadd="${p.id}">Add to cart</button>` : ''}</div></div></div>`;

  const root = document.createElement('div'); root.id = 'cb';
  root.innerHTML = `<button id="cbBtn" aria-label="Chat with our assistant" title="Ask AquaLuxe Assistant"><span>🐠</span><i id="cbDot"></i></button>
    <section id="cbWin" aria-label="AquaLuxe assistant" hidden>
      <header><div><b>AquaLuxe Assistant</b><small>Products · delivery · fish &amp; plant care</small></div><button id="cbNew" title="Start a new chat" aria-label="New chat">⟲</button><button id="cbX" aria-label="Close chat">×</button></header>
      <div id="cbLog" role="log" aria-live="polite"></div>
      <div id="cbChips"></div>
      <form id="cbForm"><input id="cbIn" maxlength="800" placeholder="Ask me anything… / বাংলায় লিখুন" autocomplete="off"><button id="cbSend" aria-label="Send">➤</button></form>
      <p class="cb-foot">AI can make mistakes. For orders &amp; payments please use the website or WhatsApp.</p></section>`;
  document.body.appendChild(root);
  const $c = s => root.querySelector(s), log = $c('#cbLog');
  const CHIPS = ['What are the delivery charges?', 'Best plants for beginners', 'মাছের গায়ে সাদা দাগ কেন?', 'Track my order'];
  const GREET = 'Hi! I\'m the AquaLuxe assistant 🐠 Ask me about products, prices, delivery, your order, or fish & plant care. আপনি বাংলায় বা Banglish-এও লিখতে পারেন।';

  function add(role, text, products, noSave) {
    const d = document.createElement('div'); d.className = 'cb-m ' + role;
    d.innerHTML = (role === 'bot' ? fmt(text) : `<p>${E(text)}</p>`) + (products && products.length ? `<div class="cb-cards">${products.map(cardHtml).join('')}</div>` : '');
    log.appendChild(d); log.scrollTop = log.scrollHeight;
    if (!noSave) { st.msgs.push({ role, text, products: products || [] }); save(); }
  }
  function render() {
    log.innerHTML = ''; if (!st.msgs.length) add('bot', GREET, null, true); else st.msgs.forEach(m => add(m.role, m.text, m.products, true));
    $c('#cbChips').style.display = st.msgs.length ? 'none' : 'flex';
  }
  $c('#cbChips').innerHTML = CHIPS.map(c => `<button type="button">${E(c)}</button>`).join('');

  function toggle(on) { open = on; $c('#cbWin').hidden = !on; root.classList.toggle('open', on); $c('#cbDot').style.display = 'none'; if (on) { render(); setTimeout(() => $c('#cbIn').focus(), 50); } }
  async function send(text) {
    text = text.trim(); if (!text || busy) return; busy = true; $c('#cbSend').disabled = true; $c('#cbChips').style.display = 'none';
    add('user', text); const typing = document.createElement('div'); typing.className = 'cb-m bot cb-typing'; typing.innerHTML = '<span></span><span></span><span></span>'; log.appendChild(typing); log.scrollTop = log.scrollHeight;
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 60000);
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, conversationId: st.cid, sid: st.sid }), signal: ctl.signal });
      const d = await r.json().catch(() => ({})); typing.remove();
      if (!r.ok) add('bot', d.error || 'Something went wrong. Please try again.', null, true);
      else { if (d.conversationId) st.cid = d.conversationId; add('bot', d.response, d.products); }
    } catch (e) { typing.remove(); add('bot', e.name === 'AbortError' ? 'That took too long. Please try again.' : 'I could not connect. Please check your internet and try again.', null, true); }
    clearTimeout(to); busy = false; $c('#cbSend').disabled = false; $c('#cbIn').focus();
  }
  $c('#cbBtn').onclick = () => toggle(!open); $c('#cbX').onclick = () => toggle(false);
  $c('#cbNew').onclick = () => { st.msgs = []; st.cid = null; save(); render(); };
  $c('#cbForm').onsubmit = e => { e.preventDefault(); const i = $c('#cbIn'), v = i.value; i.value = ''; send(v); };
  $c('#cbChips').onclick = e => { const b = e.target.closest('button'); if (b) send(b.textContent); };
  log.onclick = e => { const b = e.target.closest('[data-cbadd]'); if (!b) return; const p = st.msgs.flatMap(m => m.products || []).find(x => x.id == b.dataset.cbadd); if (p && typeof Cart !== 'undefined') Cart.add({ id: p.id, name: p.name, price: p.price, image: p.image, stock: p.stock, category_icon: p.category_icon }); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) toggle(false); });
  if (!st.msgs.length) setTimeout(() => { if (!open) $c('#cbDot').style.display = 'block'; }, 4000);
})();

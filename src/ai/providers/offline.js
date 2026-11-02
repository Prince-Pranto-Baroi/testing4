// "No-AI mode": answers WITHOUT any AI service or API key. It understands the question with the built-in language/topic
// detector (English, Bangla, Banglish), then answers from AquaLuxe's real data: products, delivery rules, order tracking and the
// aquarium knowledge base. It cannot hold a free conversation; when it does not know, it says so and logs the question for the owner.
const { classifyIntent } = require('../nlu/intentClassifier');
const { detectLanguage } = require('../nlu/language');
const cfg = require('../../config');

const DISTRICTS = "Dhaka,Gazipur,Narayanganj,Narsingdi,Munshiganj,Manikganj,Tangail,Kishoreganj,Faridpur,Gopalganj,Madaripur,Rajbari,Shariatpur,Chattogram,Cox's Bazar,Cumilla,Brahmanbaria,Chandpur,Noakhali,Feni,Lakshmipur,Khagrachhari,Rangamati,Bandarban,Sylhet,Moulvibazar,Habiganj,Sunamganj,Rajshahi,Bogura,Pabna,Sirajganj,Natore,Naogaon,Chapainawabganj,Joypurhat,Khulna,Jashore,Satkhira,Bagerhat,Kushtia,Magura,Narail,Chuadanga,Meherpur,Jhenaidah,Barishal,Bhola,Patuakhali,Pirojpur,Jhalokati,Barguna,Rangpur,Dinajpur,Kurigram,Gaibandha,Lalmonirhat,Nilphamari,Thakurgaon,Panchagarh,Mymensingh,Jamalpur,Netrokona,Sherpur".split(',');
const BN_DISTRICT = { 'ঢাকা': 'Dhaka', 'গাজীপুর': 'Gazipur', 'চট্টগ্রাম': 'Chattogram', 'সিলেট': 'Sylhet', 'খুলনা': 'Khulna', 'রাজশাহী': 'Rajshahi', 'বরিশাল': 'Barishal', 'রংপুর': 'Rangpur', 'ময়মনসিংহ': 'Mymensingh', 'কুমিল্লা': 'Cumilla', 'নারায়ণগঞ্জ': 'Narayanganj' };
const bnDigits = s => s.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));

const RX = {
  greet: /^\s*(hi|hello|hey|hlw|salam|assalamu\w*|good (morning|evening|afternoon)|হ্যালো|হাই|সালাম|আসসালামু\w*|নমস্কার)\b/i,
  thanks: /\b(thanks|thank you|thx|dhonnobad|dhonyobad)\b|ধন্যবাদ/i,
  track: /\b(track|tracking|order status|where is my order|my order|order kothay|order koi)\b|ট্র্যাক|অর্ডার.*(স্ট্যাটাস|কোথায়)/i,
  howOrder: /\bhow (do|can|to|should) (i |we )?(order|buy|purchase)|order (korbo|kivabe|korte)|কিভাবে অর্ডার|অর্ডার করব/i,
  delivery: /\b(deliver\w*|shipping|courier|charge|advance|bkash|nagad|payment|pay|cash on|cod|refund|return|how long)\b|ডেলিভারি|চার্জ|অ্যাডভান্স|বিকাশ|নগদ|পেমেন্ট|কত দিন|কতদিন/i,
  contact: /\b(phone|call|whatsapp|contact|address|location|where are you|opening|hours|email)\b|ফোন|যোগাযোগ|ঠিকানা|হোয়াটসঅ্যাপ/i,
  shop: /\b(price|cost|how much|koto|dam|taka|available|availability|stock|do you have|have you|you have|got any|buy|sell|selling|show|list|recommend|suggest|offer|discount)\b|দাম|কত|আছে|কিনতে|কিনব|দেখান/i
};
const STOP = new Set(['the', 'for', 'and', 'with', 'any', 'you', 'have', 'got', 'need', 'want', 'buy', 'price', 'how', 'much', 'show', 'can', 'what', 'which', 'good', 'best', 'cheap', 'some', 'your', 'are', 'there', 'does', 'this', 'that', 'koto', 'dam', 'taka', 'ache', 'ki', 'amar', 'dorkar', 'lagbe', 'please', 'plz', 'available', 'stock', 'sell', 'list', 'recommend', 'suggest', 'offer', 'discount', 'cost', 'tk', 'bdt', 'online']);
const GENERIC = new Set(['fish', 'fishes', 'plant', 'plants', 'aquarium', 'tank', 'water', 'white', 'spots', 'does', 'why', 'when', 'where', 'who', 'how', 'help', 'problem', 'work']);
const SAFETY_INTENTS = new Set(['FISH_DISEASE', 'FISH_EMERGENCY', 'FISH_BEHAVIOR']);

const T = {
  en: {
    greet: "Hi! I'm the AquaLuxe assistant 🐠 Ask me about product prices and stock, delivery and payment, tracking an order, or fish & plant care. You can also write in Bangla or Banglish.",
    thanks: "You're welcome! Anything else I can help with? 🐠",
    askTrack: 'To track an order, please send the **order number** (like AL261026-1234) and the **phone number** used for the order, in one message.',
    needPhone: 'I have the order number. Please also send the phone number used for the order so I can look it up.',
    needNo: 'I have the phone number. Please also send the order number (like AL261026-1234).',
    noOrder: 'I could not find an order with that number and phone. Please check both and try again.',
    ordering: 'Ordering is easy and needs no account: add products to your cart, go to checkout, choose your district, and pay the advance by bKash/Nagad. We phone you to confirm before shipping.',
    noProduct: "I couldn't find a matching product. You can browse everything here:",
    found: "Here's what I found:",
    careFoot: '💬 For advice specific to your tank, message our team on WhatsApp.',
    safety: '⚠️ This is general guidance, not a diagnosis. Test ammonia and nitrite first, avoid random medication, and ask an aquatic vet or experienced specialist if several fish are affected or it gets worse.',
    unknown: "I'm sorry, I don't have reliable information on that. I've noted your question for our team. For a quick answer please contact us:"
  },
  bn: {
    greet: 'হ্যালো! আমি AquaLuxe সহকারী 🐠 পণ্যের দাম, ডেলিভারি, পেমেন্ট, অর্ডার ট্র্যাকিং বা মাছ-গাছের যত্ন নিয়ে জিজ্ঞাসা করুন। বাংলা বা Banglish-এও লিখতে পারেন।',
    thanks: 'আপনাকে ধন্যবাদ! আর কিছু জানার থাকলে বলুন 🐠',
    askTrack: 'অর্ডার ট্র্যাক করতে একই মেসেজে **অর্ডার নম্বর** (যেমন AL261026-1234) এবং অর্ডারের **ফোন নম্বর** লিখুন।',
    needPhone: 'অর্ডার নম্বর পেয়েছি। খুঁজে দেখতে অর্ডারের ফোন নম্বরটিও লিখুন।',
    needNo: 'ফোন নম্বর পেয়েছি। অনুগ্রহ করে অর্ডার নম্বরটিও লিখুন (যেমন AL261026-1234)।',
    noOrder: 'এই নম্বর ও ফোনে কোনো অর্ডার পাইনি। দুটোই ঠিক আছে কিনা দেখে আবার লিখুন।',
    ordering: 'অর্ডার করা সহজ, অ্যাকাউন্ট লাগে না: পণ্য কার্টে যোগ করুন, চেকআউটে জেলা বেছে নিন এবং বিকাশ/নগদে অ্যাডভান্স দিন। পাঠানোর আগে আমরা ফোন করে নিশ্চিত করি।',
    noProduct: 'মিল আছে এমন কোনো পণ্য পাইনি। সব পণ্য এখানে দেখুন:',
    found: 'যা পেয়েছি:',
    careFoot: '💬 আপনার ট্যাঙ্কের নির্দিষ্ট পরামর্শের জন্য WhatsApp-এ আমাদের টিমকে মেসেজ করুন।',
    safety: '⚠️ এটি সাধারণ পরামর্শ, নিশ্চিত রোগ নির্ণয় নয়। আগে অ্যামোনিয়া ও নাইট্রাইট পরীক্ষা করুন, অযথা ওষুধ দেবেন না; একাধিক মাছ আক্রান্ত হলে বা অবস্থা খারাপ হলে অ্যাকুয়াটিক ভেট বা অভিজ্ঞ বিশেষজ্ঞের পরামর্শ নিন।',
    unknown: 'দুঃখিত, এ বিষয়ে আমার কাছে নির্ভরযোগ্য তথ্য নেই। প্রশ্নটি আমাদের টিমের জন্য নোট করেছি। দ্রুত উত্তরের জন্য যোগাযোগ করুন:'
  }
};

const words = (m, extra = []) => bnDigits(m).toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(w => w.length >= 3 && !STOP.has(w) && !extra.includes(w));
const strip = m => m.replace(/\bAL\d{6}-\d{4}\b/gi, ' ').replace(/(?:\+?88)?01\d{9}/g, ' ');

async function runAgentTurn({ message, executeTool, context }) {
  const msg = bnDigits(message), L = detectLanguage(message) === 'bn' ? 'bn' : 'en', t = T[L];
  const cls = classifyIntent(message, null), grounding = context.pipeline && context.pipeline.grounding;
  const done = content => ({ content, toolCalls: [] });
  const info = async () => executeTool('getStoreInfo', {}, context);
  const contactLines = async () => { const s = await info(); return [s.phone && `📞 ${s.phone}`, s.whatsapp && `💬 WhatsApp: ${s.whatsapp}`, s.email && `✉️ ${s.email}`, s.address && `📍 ${s.address}`, `🕘 ${s.hours}`].filter(Boolean).join('\n'); };

  // 1. greeting / thanks
  if (msg.trim().length < 45 && RX.greet.test(msg) && !RX.shop.test(msg)) return done(t.greet);
  if (msg.trim().length < 50 && RX.thanks.test(msg)) return done(t.thanks);

  // 2. order tracking (needs BOTH order number and phone)
  const no = (msg.match(/\bAL\d{6}-\d{4}\b/i) || [])[0], ph = (msg.replace(/\bAL\d{6}-\d{4}\b/gi, ' ').replace(/(\d)[\s-]+(?=\d)/g, '$1').match(/(?:\+?88)?01\d{9}/) || [])[0];
  if (no || RX.track.test(msg)) {
    if (!no && !ph) return done(t.askTrack); if (no && !ph) return done(t.needPhone); if (!no && ph) return done(t.needNo);
    const o = await executeTool('trackOrder', { orderNo: no, phone: ph }, context);
    if (!o.found) return done(t.noOrder);
    const adv = o.advance_required != null ? (L === 'bn' ? `\nঅ্যাডভান্স: ৳${o.advance_required} (${o.advance_status}) · ডেলিভারিতে বাকি: ৳${o.balance_on_delivery}` : `\nAdvance: ৳${o.advance_required} (${o.advance_status}) · Balance on delivery: ৳${o.balance_on_delivery}`) : '';
    return done(`**${L === 'bn' ? 'অর্ডার' : 'Order'} ${o.order_no}** — ${L === 'bn' ? 'অবস্থা' : 'status'}: **${o.status}**\n${o.items.map(i => `- ${i}`).join('\n')}\n${L === 'bn' ? 'মোট' : 'Total'}: ৳${o.total}${adv}`);
  }
  if (RX.howOrder.test(msg)) { const s = await info(); return done(`${t.ordering}\n${s.links.checkout}`); }

  // 3. delivery cost for a district (+ amount), delivery/payment rules, contact details
  const low = msg.toLowerCase(), dist = DISTRICTS.find(d => new RegExp(`\\b${d.replace("'", "'?")}\\b`, 'i').test(low)) || Object.entries(BN_DISTRICT).find(([b]) => msg.includes(b))?.[1];
  const amt = Number((strip(msg).replace(/,/g, '').match(/\b\d{3,6}\b/) || [])[0]);
  if (dist && amt >= 50 && (RX.delivery.test(msg) || RX.shop.test(msg) || /\b(order|total)\b/i.test(msg))) {
    const c = await executeTool('calculateOrderCost', { district: dist, subtotal: amt }, context);
    return done(L === 'bn'
      ? `**${dist} (${c.area === 'Inside Dhaka' ? 'ঢাকার ভেতরে' : 'ঢাকার বাইরে'})**, পণ্যের মূল্য ৳${c.product_subtotal}\n- ডেলিভারি চার্জ: ৳${c.delivery_charge}\n- মোট: ৳${c.total}\n- এখন অ্যাডভান্স (বিকাশ/নগদ): **৳${c.advance_to_pay_now}**\n- ডেলিভারির সময় ক্যাশ: ৳${c.balance_cash_on_delivery}`
      : `**${dist} (${c.area})**, product total ৳${c.product_subtotal}\n- Delivery charge: ৳${c.delivery_charge}\n- Order total: ৳${c.total}\n- Advance to pay now (bKash/Nagad): **৳${c.advance_to_pay_now}**\n- Cash on delivery: ৳${c.balance_cash_on_delivery}`);
  }
  const wantDelivery = RX.delivery.test(msg), wantContact = RX.contact.test(msg);
  if (wantDelivery || wantContact) {
    const s = await info(), d = cfg.delivery, out = [];
    if (wantDelivery) out.push(L === 'bn'
      ? `**ডেলিভারি ও পেমেন্ট**\n- ঢাকা: চার্জ ৳${d.insideDhaka}, যা অগ্রিম (বিকাশ/নগদ) দিতে হবে; পণ্যের দাম ডেলিভারির সময় ক্যাশ।\n- ঢাকার বাইরে: চার্জ ৳${d.outsideDhaka}; পণ্যের দামের ${d.outsideAdvanceRate * 100}% অগ্রিম, বাকি ${d.outsideAdvanceRate * 100}% + ডেলিভারি চার্জ ক্যাশ।\n- সময়: ঢাকায় ১–২ কর্মদিবস, বাইরে ২–৪ কর্মদিবস।\nহিসাব জানতে জেলা ও টাকার পরিমাণ লিখুন (যেমন "Sylhet 1000")।`
      : `**Delivery & payment**\n- Inside Dhaka: delivery ৳${d.insideDhaka}, paid in advance by bKash/Nagad; the product total is paid in cash on delivery.\n- Outside Dhaka: delivery ৳${d.outsideDhaka}; ${d.outsideAdvanceRate * 100}% of the product total in advance, the other ${d.outsideAdvanceRate * 100}% plus delivery in cash on delivery.\n- Time: Dhaka 1-2 working days, outside Dhaka 2-4 working days.\nTell me your district and amount (e.g. "Sylhet 1000") and I'll calculate it.`);
    if (wantContact || !out.length) out.push((L === 'bn' ? '**যোগাযোগ**\n' : '**Contact**\n') + await contactLines());
    return done(out.join('\n\n'));
  }

  // 4. products: prices, stock, "do you have ..."
  const careIntent = cls.intent && !['UNKNOWN', 'PRODUCT_SEARCH', 'PRODUCT_INFORMATION', 'PRICE'].includes(cls.intent) && grounding && grounding.acceptable;
  const shopWords = RX.shop.test(msg), ws = words(strip(msg)).filter(w => shopWords || !GENERIC.has(w));
  if (ws.length && (shopWords || !careIntent)) {
    const r = await executeTool('searchProducts', { query: ws.join(' '), limit: 5 }, context);
    const stem = w => w.replace(/(es|s)$/, ''), hit = r.products.filter(p => ws.some(w => (p.name + ' ' + p.category).toLowerCase().includes(stem(w))));
    if (hit.length) { context.cards && [...context.cards.keys()].forEach(id => { if (!hit.some(p => p.id === id)) context.cards.delete(id); });
      return done(`${t.found}\n${hit.map(p => `- **${p.name}** — ৳${p.price}${p.old_price ? ` (was ৳${p.old_price})` : ''} · ${p.stock_note}\n  ${p.url}`).join('\n')}`); }
    context.cards && context.cards.clear();
    if (shopWords && !careIntent) { const s = await info(); return done(`${t.noProduct}\n${s.links.shop}`); }
  }

  // 5. aquarium knowledge (English / Bangla)
  if (careIntent) {
    const docs = grounding.filtered, pick = docs.find(d => d.language === (L === 'bn' ? 'bn' : 'en') && /^\[Bilingual KB/.test(d.title)) || docs.find(d => d.language === (L === 'bn' ? 'bn' : 'en')) || docs[0];
    let body = (pick.content.match(/Answer:\s*([\s\S]*?)\n\n(?:Keywords|Related|Sources)/) || [])[1];
    if (!body) { body = pick.content.replace(/^#+\s.*$/gm, '').replace(/\n{2,}/g, '\n').trim().slice(0, 900); body = body.slice(0, Math.max(body.lastIndexOf('\n'), 400)); }
    const title = pick.title.replace(/^\[Bilingual KB (EN|BN)\]\s*/, '');
    return done(`**${title}**\n\n${body.trim()}\n\n${SAFETY_INTENTS.has(cls.intent) ? t.safety + '\n\n' : ''}${t.careFoot}`);
  }

  // 6. don't know: say so honestly and log it for the owner to review in Admin > AI Chat
  try { await executeTool('logUnknownQuestion', { question: message.slice(0, 500), language: detectLanguage(message), intent: cls.intent || 'UNKNOWN', attemptedAnswer: 'No-AI mode: nothing relevant found', confidence: 'low' }, context); } catch (e) {}
  return done(`${t.unknown}\n${await contactLines()}`);
}
module.exports = { runAgentTurn };

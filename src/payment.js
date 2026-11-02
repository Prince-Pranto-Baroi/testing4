// Delivery + advance-payment rules. The SERVER is the only place these are applied to real orders.
const cfg = require('./config');

const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
const phoneKey = p => String(p || '').replace(/\D/g, '').slice(-10);   // 017xxxxxxxx, +88017xxxxxxxx -> same customer
const zoneOf = district => String(district || '').trim().toLowerCase() === 'dhaka' ? 'inside_dhaka' : 'outside_dhaka';

// Inside Dhaka : delivery 90, advance = 90 (the delivery charge), balance = product subtotal.
// Outside Dhaka: delivery 150, advance = 50% of PRODUCT subtotal only, balance = other 50% + 150.
function calcPayment(subtotal, district) {
  const d = cfg.delivery, zone = zoneOf(district), inside = zone === 'inside_dhaka';
  const sub = round2(subtotal), shipping = inside ? d.insideDhaka : d.outsideDhaka, total = round2(sub + shipping);
  const advance = Math.min(total, round2(inside ? d.insideDhaka : sub * d.outsideAdvanceRate));
  return { zone, subtotal: sub, shipping, total, advance, balance: round2(total - advance) };
}

module.exports = { calcPayment, zoneOf, phoneKey, round2 };

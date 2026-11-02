// Adds FAKE demo orders + purchases so you can see the dashboard & reports with data.
//   npm run demo-data    -> add demo data
//   npm run clear-demo   -> remove all demo data again
const db = require('../src/db');
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const NAMES = ['Rahim Uddin', 'Nusrat Jahan', 'Tanvir Ahmed', 'Sadia Islam', 'Mehedi Hasan', 'Farhana Akter', 'Imran Hossain', 'Ayesha Siddika', 'Kamal Hossain', 'Mim Chowdhury'];
const AREAS = ['Mirpur, Dhaka', 'Dhanmondi, Dhaka', 'Uttara, Dhaka', 'GEC Circle, Chattogram', 'Zindabazar, Sylhet', 'Banani, Dhaka', 'Rajshahi Sadar', 'Khulna Sadar'];
(async () => {
  await db.init(); const pool = db.getPool();
  if (process.argv[2] === 'clear') {
    await pool.query("DELETE FROM orders WHERE notes = '__demo__'"); await pool.query("DELETE FROM purchases WHERE note = '__demo__'");
    console.log('Demo orders and purchases removed.'); return process.exit(0);
  }
  const [prods] = await pool.query('SELECT id, name, price, cost_price FROM products');
  if (!prods.length) { console.log('Add some products first.'); return process.exit(1); }
  for (let day = 29; day >= 0; day--) {
    for (let n = rnd(0, 4); n > 0; n--) {
      const when = new Date(); when.setDate(when.getDate() - day); when.setHours(rnd(9, 21), rnd(0, 59), 0, 0);
      const picks = [...prods].sort(() => Math.random() - .5).slice(0, rnd(1, 3)), sub = picks.reduce((a, p) => a + p.price * (p.q = rnd(1, 3)), 0), ship = sub >= 5000 ? 0 : 100;
      const st = day > 5 ? (Math.random() < .08 ? 'cancelled' : 'delivered') : ['pending', 'confirmed', 'shipped', 'delivered'][rnd(0, 3)];
      const [r] = await pool.query('INSERT INTO orders (order_no, customer_name, customer_phone, customer_address, district, payment_method, notes, subtotal, shipping, total, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [`DEMO-${when.getTime().toString().slice(-8)}${rnd(10, 99)}`, NAMES[rnd(0, 9)], '01' + rnd(3, 9) + String(rnd(10000000, 99999999)), AREAS[rnd(0, 7)], 'Dhaka', ['cod', 'cod', 'bkash', 'nagad'][rnd(0, 3)], '__demo__', sub, ship, sub + ship, st, when]);
      for (const p of picks) await pool.query('INSERT INTO order_items (order_id, product_id, product_name, price, cost, qty) VALUES (?,?,?,?,?,?)', [r.insertId, p.id, p.name, p.price, p.cost_price, p.q]);
    }
    if (day % 6 === 0) {
      const p = prods[rnd(0, prods.length - 1)], qty = rnd(5, 20), when = new Date(); when.setDate(when.getDate() - day); when.setHours(11, 0, 0, 0);
      await pool.query('INSERT INTO purchases (product_id, product_name, supplier, qty, unit_cost, total, note, created_at) VALUES (?,?,?,?,?,?,?,?)', [p.id, p.name, 'Demo Supplier', qty, p.cost_price, qty * p.cost_price, '__demo__', when]);
    }
  }
  console.log('Demo data added! Open the Admin dashboard. Remove it later with: npm run clear-demo'); process.exit(0);
})();

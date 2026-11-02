const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');

let pool;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  const real = Buffer.from(hash, 'hex');
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}

const CATEGORIES = [
  ['Aquarium Fish', 'aquarium-fish', '🐠'],
  ['Aquatic Plants', 'aquatic-plants', '🌿'],
  ['Bogwood & Driftwood', 'bogwood-driftwood', '🪵'],
  ['Aquarium Lights', 'aquarium-lights', '💡'],
  ['Fish Food', 'fish-food', '🍤'],
  ['Aquarium Accessories', 'aquarium-accessories', '🧰'],
  ['Aquarium Equipment', 'aquarium-equipment', '⚙️'],
  ['Substrate & Aquasoil', 'substrate-aquasoil', '🪨']
];

const SAMPLE_PRODUCTS = [
  // name, cat slug, price, old, cost, stock, image, featured, description, how_to_use
  ['Rotala Rotundifolia Red (Bunch)', 'aquatic-plants', 350, 420, 190, 40, 'plant-red.jpg', 1, 'A fast-growing stem plant that turns a vivid red-orange under strong light. Perfect for the background of any planted tank. Grown submerged, healthy and pest-free.', 'Plant in the substrate 2 cm deep, 3-5 cm apart. Needs strong light, CO2 and iron-rich fertiliser for the best red colour. Trim the tops to make it bushy.'],
  ['Ludwigia Super Red (Bunch)', 'aquatic-plants', 400, null, 220, 28, 'plant-rotala.jpg', 1, 'Deep burgundy leaves that add strong contrast to green plants. A favourite for aquascapers.', 'Plant in groups. High light brings out the deep red. Trim and replant the tops every few weeks.'],
  ['Amazon Sword (Potted)', 'aquatic-plants', 280, null, 140, 18, 'plant-sword.jpg', 0, 'A classic centrepiece plant with large green leaves. Easy to grow and very forgiving for beginners.', 'Place in a root tab or nutrient-rich substrate. Leave space around it - it grows big. Remove old yellow leaves.'],
  ['Spiderwood Branch - Medium', 'bogwood-driftwood', 1200, 1500, 650, 12, 'wood-moss.jpg', 1, 'Natural spiderwood with a beautiful branching shape. Ideal for creating the main structure of an aquascape and for growing moss and Anubias.', 'Soak in water for 1-2 weeks until it sinks. Boil for 30 minutes to remove tannins and sterilise. Attach plants with thread or glue.'],
  ['Natural Driftwood Sculpture (Hand-picked)', 'bogwood-driftwood', 2500, null, 1400, 4, 'driftwood-real.jpg', 1, 'One-of-a-kind driftwood piece with natural holes and texture. Each piece is hand-picked, so the shape is unique. Great for Iwagumi and jungle style tanks.', 'Rinse well and soak until it sinks. Boil if possible. Water may turn slightly yellow at first - this is harmless tannin and a water change fixes it.'],
  ['Full-Spectrum LED Light 60 cm', 'aquarium-lights', 4500, 5200, 3000, 9, null, 1, 'Slim full-spectrum LED light for planted tanks up to 60 cm. Adjustable brightness with 6500K daylight and RGB colour channels.', 'Mount on the tank rim or with brackets. Run 6-8 hours a day using a timer. Start at 50% brightness for the first 2 weeks to avoid algae.'],
  ['Premium Tropical Fish Flakes 100 g', 'fish-food', 450, null, 260, 60, null, 0, 'Balanced daily flakes with spirulina and vitamins for bright colours and healthy growth of tropical community fish.', 'Feed a small pinch 1-2 times a day. Only give what fish finish in 2 minutes. Keep the container sealed and dry.'],
  ['Betta Pellets 50 g', 'fish-food', 320, null, 180, 3, null, 0, 'High-protein floating pellets made for betta fish. Small size, easy to eat, boosts colour and fin growth.', 'Feed 2-4 pellets once or twice a day. Skip feeding one day a week to keep your betta healthy.'],
  ['Neon Tetra (Pack of 10)', 'aquarium-fish', 600, null, 350, 25, null, 1, 'Peaceful, shimmering schooling fish that look stunning in planted tanks. Healthy, acclimatised and eating well.', 'Keep in groups of 10 or more in a tank of 40 L+. Stable pH 6-7.5, temperature 24-27 C. Float the bag 20 minutes before release.'],
  ['Betta Fish - Halfmoon', 'aquarium-fish', 800, null, 450, 7, null, 0, 'Beautiful halfmoon betta with a wide tail spread. Sold one per cup, healthy and active.', 'Needs at least 10 L tank with a heater and a lid. Keep one male per tank. Feed betta pellets twice daily.'],
  ['Canister Filter 1000 L/h', 'aquarium-equipment', 7500, 8500, 5200, 6, null, 1, 'Quiet external canister filter for tanks up to 200 L. Multi-stage filtration keeps water crystal clear.', 'Fill the canister with media (sponge, bio-rings, carbon). Prime the pump, connect the hoses and plug in. Rinse the media in tank water monthly.'],
  ['Digital Aquarium Heater 100 W', 'aquarium-equipment', 1800, null, 1100, 11, null, 0, 'Adjustable submersible heater with digital display and auto shut-off protection.', 'Place near the filter outlet for even heat. Wait 30 minutes after filling before plugging in. Set to 25-26 C for tropical fish.'],
  ['Nature Aquasoil 3 L (Black)', 'substrate-aquasoil', 1500, null, 900, 15, null, 1, 'Nutrient-rich aquasoil that gives plants a strong start and lowers pH slightly - the base of every serious planted tank.', 'Rinse lightly, spread 3-5 cm deep (higher at the back). Fill the tank slowly with a plate to avoid disturbing the soil.'],
  ['Aquascaping Tool Set (5 pcs)', 'aquarium-accessories', 2200, 2600, 1300, 8, null, 0, 'Stainless-steel tweezers, scissors and spatula set for planting, trimming and cleaning your aquascape.', 'Use the long tweezers to plant stems, the curved scissors to trim carpets. Rinse with clean water and dry after use to avoid rust.'],
  ['Water Conditioner 250 ml', 'aquarium-accessories', 380, null, 210, 2, null, 0, 'Instantly removes chlorine and chloramine from tap water. Makes water safe for fish in seconds.', 'Add 5 ml per 20 L of tap water before adding it to the tank. Safe to dose directly into the aquarium during water changes.']
];

async function init() {
  const base = { host: cfg.db.host, port: cfg.db.port, user: cfg.db.user, password: cfg.db.password, multipleStatements: true };
  const boot = await mysql.createConnection(base);
  await boot.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8').replace(/aqualuxe_db/g, cfg.db.database));
  await boot.end();

  pool = mysql.createPool({ ...cfg.db, waitForConnections: true, connectionLimit: 10, decimalNumbers: true, dateStrings: false });

  // First-run seeding (only when tables are empty)
  // Upgrade older databases (CREATE TABLE IF NOT EXISTS does not add new columns)
  const addCol = async (table, col, ddl) => {
    const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?', [cfg.db.database, table, col]);
    if (!n) await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${ddl}`);
  };
  await addCol('orders', 'delivery_zone', 'VARCHAR(20) NULL');
  await addCol('orders', 'advance_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
  await addCol('orders', 'balance_due', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
  await addCol('orders', 'advance_status', "VARCHAR(12) NOT NULL DEFAULT 'unpaid'");
  await addCol('orders', 'advance_trx', 'VARCHAR(60) NULL');

  const [[{ n: admins }]] = await pool.query('SELECT COUNT(*) n FROM admin_users');
  if (!admins) {
    await pool.query('INSERT INTO admin_users (username, name, password_hash) VALUES (?,?,?)', [cfg.admin.username, 'Store Owner', hashPassword(cfg.admin.password)]);
    console.log(`  First run: admin login created -> username "${cfg.admin.username}", password "${cfg.admin.password}" (change it in Admin > Settings)`);
  }
  const [[{ n: cats }]] = await pool.query('SELECT COUNT(*) n FROM categories');
  if (!cats) {
    for (let i = 0; i < CATEGORIES.length; i++) await pool.query('INSERT INTO categories (name, slug, icon, sort_order) VALUES (?,?,?,?)', [...CATEGORIES[i], i]);
  }
  const [[{ n: prods }]] = await pool.query('SELECT COUNT(*) n FROM products');
  if (!prods) {
    const [catRows] = await pool.query('SELECT id, slug FROM categories');
    const cmap = Object.fromEntries(catRows.map(c => [c.slug, c.id]));
    let i = 0;
    for (const p of SAMPLE_PRODUCTS) {
      await pool.query(
        'INSERT INTO products (name, category_id, price, old_price, cost_price, stock, image, is_featured, description, how_to_use, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [p[0], cmap[p[1]], p[2], p[3], p[4], p[5], p[6] ? '/images/' + p[6] : null, p[7], p[8], p[9], i++]);
    }
  }
  const defaults = { store_name: 'AquaLuxe', phone: '+880 1700-000000', whatsapp: '8801700000000', email: 'hello@aqualuxe.com', address: 'Dhaka, Bangladesh', announcement: 'Delivery ৳90 inside Dhaka · ৳150 outside Dhaka · Cash on delivery for the remaining balance', vip_spend: '10000', loyal_orders: '3' };
  for (const [k, v] of Object.entries(defaults)) await pool.query('INSERT IGNORE INTO settings (k, v) VALUES (?,?)', [k, v]);
  // Aquarium knowledge for the chat assistant (English + Bangla). A failure here must never stop the shop from starting.
  try { const r = await require('./ai/knowledgeSeed').seed(); if (r.added) console.log(`  AI knowledge loaded: ${r.added} documents`); } catch (e) { console.warn('  AI knowledge could not be loaded:', e.message); }
  // Old default banner promised free delivery, which no longer applies
  await pool.query("UPDATE settings SET v = ? WHERE k = 'announcement' AND v = ?", [defaults.announcement, 'Free delivery on orders over ৳5,000 · Cash on delivery all over Bangladesh']);
  return pool;
}

module.exports = { init, getPool: () => pool, hashPassword, verifyPassword, CATEGORIES };

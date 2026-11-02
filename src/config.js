// Reads a ".env" file next to package.json (if present) so you can keep secrets like the AI key out of the code.
// Real environment variables always win. No extra package needed.
try {
  const fs = require('fs'), path = require('path'), f = path.join(__dirname, '..', '.env');
  if (fs.existsSync(f)) for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/); if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (e) {}

// Change these only if your MySQL (XAMPP) is different. Default XAMPP = user root, empty password.
module.exports = {
  port: process.env.PORT || 3000,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'aqualuxe_db'
  },
  // Public website address used in chat links, e.g. https://www.yourshop.com (leave empty to use the address the visitor used)
  siteUrl: (process.env.SITE_URL || '').replace(/\/$/, ''),
  // AI chat assistant. The key lives only in .env / environment variables and is never sent to the browser.
  ai: {
    provider: (process.env.AI_PROVIDER || 'anthropic').toLowerCase(),
    get enabled() { return this.provider !== 'local' && !!process.env.AI_API_KEY; },
    perMinute: Number(process.env.AI_RATE_PER_MINUTE || 8), perDay: Number(process.env.AI_RATE_PER_DAY || 80), dailyCap: Number(process.env.AI_DAILY_CAP || 500)
  },
  // Fixed delivery charges and advance rule (applied on the server, shown on the website)
  delivery: { insideDhaka: 90, outsideDhaka: 150, outsideAdvanceRate: 0.5 },
  admin: { username: 'admin', password: 'admin123' } // first-run login. Change it inside Admin > Settings.
};

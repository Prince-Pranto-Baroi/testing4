// Gives the AI code the same query(sql, params) helper it expects, on top of AquaLuxe's own MySQL pool.
// SELECT -> array of rows. INSERT/UPDATE/DELETE -> result object (insertId, affectedRows).
const db = require('../db');
async function query(sql, params = []) { const [r] = await db.getPool().query(sql, params); return r; }
module.exports = { query };

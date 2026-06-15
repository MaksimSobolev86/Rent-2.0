const pool = require("../db");

let dealTypeColumnCache = null;

async function hasDealTypeColumn() {
  if (dealTypeColumnCache !== null) {
    return dealTypeColumnCache;
  }
  const result = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'items'
       AND column_name = 'deal_type'
     LIMIT 1;`,
  );
  dealTypeColumnCache = result.rowCount > 0;
  return dealTypeColumnCache;
}

module.exports = { hasDealTypeColumn };

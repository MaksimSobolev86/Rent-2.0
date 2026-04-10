const { query } = require('./src/db');

async function main() {
  const res = await query('SELECT NOW()');
  console.log(res.rows);
}

main().catch(console.error);
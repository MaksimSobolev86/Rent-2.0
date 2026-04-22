require("dotenv").config();
const pool = require("./src/db");

async function main() {
  const res = await pool.query("SELECT NOW()");
  console.log(res.rows);
}

main().catch(console.error);

/**
 * Установить/сбросить пароль владельца.
 * Usage: node scripts/set-owner-password.js owner@example.com NewPassword123
 */
require("dotenv").config();
const pool = require("../src/db");
const { hashPassword } = require("../src/utils/password");

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  const password = process.argv[3] ?? "";

  if (!email || !password) {
    console.error("Usage: node scripts/set-owner-password.js <email> <password>");
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("Password must be at least 6 characters");
    process.exit(1);
  }

  const result = await pool.query(
    `UPDATE owners
     SET password_hash = $2, updated_at = now()
     WHERE email = $1
     RETURNING id, email;`,
    [email, hashPassword(password)],
  );

  if (result.rowCount === 0) {
    console.error(`Owner not found: ${email}`);
    process.exit(1);
  }

  console.log(`Password updated for ${result.rows[0].email} (${result.rows[0].id})`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

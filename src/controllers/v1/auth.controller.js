const { randomUUID } = require("crypto");
const pool = require("../../db");
const { hashPassword, verifyPassword } = require("../../utils/password");

async function registerOwner(req, res) {
  try {
    const b = req.body || {};
    const email = (b.email ?? "").toString().trim().toLowerCase();
    const password = (b.password ?? "").toString();
    const firstName = (b.first_name ?? b.firstName ?? "").toString().trim();
    const lastName = (b.last_name ?? b.lastName ?? "").toString().trim();
    const phone = b.phone != null ? String(b.phone).trim() : null;

    if (!email) return res.status(400).json({ error: "email is required" });
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "password must be at least 6 characters" });
    }
    if (!firstName) return res.status(400).json({ error: "first_name is required" });
    if (!lastName) return res.status(400).json({ error: "last_name is required" });

    const existing = await pool.query(
      `SELECT id FROM owners WHERE email = $1;`,
      [email],
    );
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: "Owner with this email already exists" });
    }

    const now = new Date();
    const result = await pool.query(
      `INSERT INTO owners (
         id, email, password_hash, first_name, last_name, phone, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, email, first_name, last_name, phone, created_at, updated_at;`,
      [
        randomUUID(),
        email,
        hashPassword(password),
        firstName,
        lastName,
        phone,
        now,
        now,
      ],
    );

    const row = result.rows[0];
    return res.status(201).json({
      owner: {
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        phone: row.phone,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function loginOwner(req, res) {
  try {
    const b = req.body || {};
    const email = (b.email ?? "").toString().trim().toLowerCase();
    const password = (b.password ?? "").toString();

    if (!email) return res.status(400).json({ error: "email is required" });
    if (!password) return res.status(400).json({ error: "password is required" });

    const result = await pool.query(
      `SELECT id, email, password_hash, first_name, last_name, phone, created_at, updated_at
       FROM owners
       WHERE email = $1;`,
      [email],
    );
    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const row = result.rows[0];
    const validPassword = verifyPassword(password, row.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    return res.json({
      owner: {
        id: row.id,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        phone: row.phone,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { registerOwner, loginOwner };

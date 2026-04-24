const pool = require("../../db");

async function listOwners(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, phone, created_at, updated_at
       FROM owners
       ORDER BY created_at DESC;`,
      [],
    );

    const owners = result.rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.first_name,
      first_name: r.first_name,
      lastName: r.last_name,
      last_name: r.last_name,
      phone: r.phone,
      createdAt: r.created_at,
      created_at: r.created_at,
      updatedAt: r.updated_at,
      updated_at: r.updated_at,
    }));

    return res.json({ owners });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { listOwners };

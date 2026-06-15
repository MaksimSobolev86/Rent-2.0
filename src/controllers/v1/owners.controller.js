const pool = require("../../db");
const { requireScopedOwnerId } = require("../../utils/ownerScope");

async function listOwners(req, res) {
  try {
    const ownerId = requireScopedOwnerId(req, res);
    if (!ownerId) return;

    const result = await pool.query(
      `SELECT id, email, first_name, last_name, phone, photo_url, created_at, updated_at
       FROM owners
       WHERE id = $1;`,
      [ownerId],
    );

    const owners = result.rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.first_name,
      first_name: r.first_name,
      lastName: r.last_name,
      last_name: r.last_name,
      phone: r.phone,
      photoUrl: r.photo_url,
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

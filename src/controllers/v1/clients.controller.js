const { randomUUID } = require("crypto");

const pool = require("../../db");

async function createClient(req, res) {
  try {
    const b = req.body || {};
    const vkUserId = b.vk_user_id ?? b.vkUserId;
    const firstName = b.first_name ?? b.firstName;
    const lastName = b.last_name ?? b.lastName;
    const phone = b.phone;
    const photoUrl = b.photo_url ?? b.photoUrl;
    const role = b.role ?? "CLIENT";

    if (firstName == null || String(firstName).trim() === "") {
      return res.status(400).json({ error: "first_name is required" });
    }
    if (lastName == null || String(lastName).trim() === "") {
      return res.status(400).json({ error: "last_name is required" });
    }

    const id = randomUUID();
    const createdAt = new Date();

    const result = await pool.query(
      `INSERT INTO clients (
         id, vk_user_id, first_name, last_name, phone, photo_url, role, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, vk_user_id, first_name, last_name, phone, photo_url, role, created_at;`,
      [
        id,
        vkUserId != null ? Number(vkUserId) : null,
        String(firstName),
        String(lastName),
        phone != null ? String(phone) : null,
        photoUrl != null ? String(photoUrl) : null,
        String(role),
        createdAt,
      ],
    );

    const row = result.rows[0];
    return res.status(201).json({
      client: {
        id: row.id,
        vkUserId: row.vk_user_id,
        firstName: row.first_name,
        lastName: row.last_name,
        phone: row.phone,
        photoUrl: row.photo_url,
        role: row.role,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function listClients(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, vk_user_id, first_name, last_name, phone, photo_url, role, created_at
       FROM clients
       ORDER BY created_at DESC;`,
      [],
    );

    const clients = result.rows.map((r) => ({
      id: r.id,
      vkUserId: r.vk_user_id,
      firstName: r.first_name,
      lastName: r.last_name,
      phone: r.phone,
      photoUrl: r.photo_url,
      role: r.role,
      createdAt: r.created_at,
    }));

    return res.json({ clients });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { createClient, listClients };

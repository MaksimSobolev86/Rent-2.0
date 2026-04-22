const { randomUUID } = require("crypto");

const pool = require("../../../db");

async function createOwnerItem(req, res) {
  try {
    const ownerId = req.user.id;
    const { title, description, price } = req.body || {};

    if (!title) return res.status(400).json({ error: "title is required" });
    if (price == null || Number.isNaN(Number(price))) {
      return res.status(400).json({ error: "price must be a number" });
    }

    const id = randomUUID();
    const createdAt = new Date();
    const priceNum = Number(price);

    const result = await pool.query(
      `INSERT INTO items (
         id, owner_id, title, description, photo_url, video_url,
         price_hour, price_weekend,
         is_hidden, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8,
         $9, $10
       )
       RETURNING id, owner_id, title, description,
                 photo_url, video_url,
                 price_hour, price_weekend,
                 is_hidden, created_at;`,
      [
        id,
        ownerId,
        String(title),
        description != null ? String(description) : "",
        null,
        null,
        priceNum,
        priceNum,
        false,
        createdAt,
      ],
    );

    const row = result.rows[0];
    const item = {
      id: row.id,
      ownerId: row.owner_id,
      title: row.title,
      description: row.description ?? "",
      photoUrl: row.photo_url ?? null,
      videoUrl: row.video_url ?? null,
      priceHour: row.price_hour != null ? Number(row.price_hour) : null,
      priceWeekend: row.price_weekend != null ? Number(row.price_weekend) : null,
      price: row.price_hour != null ? Number(row.price_hour) : null,
      isHidden: Boolean(row.is_hidden),
      createdAt: row.created_at,
    };

    return res.status(201).json({ item });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function updateOwnerItem(req, res) {
  try {
    const ownerId = req.user.id;
    const { itemId } = req.params;

    const existing = await pool.query(
      `SELECT id, owner_id, title, description,
              price_hour, price_weekend,
              is_hidden, created_at
       FROM items
       WHERE id = $1;`,
      [itemId],
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }
    if (existing.rows[0].owner_id !== ownerId) {
      return res.status(403).json({ error: "Not your item" });
    }

    const { title, description, price, isHidden } = req.body || {};

    if (price != null && Number.isNaN(Number(price))) {
      return res.status(400).json({ error: "price must be a number" });
    }

    const priceNum = price != null ? Number(price) : null;

    const updated = await pool.query(
      `UPDATE items
       SET title = COALESCE($2, title),
           description = COALESCE($3, description),
           price_hour = COALESCE($4, price_hour),
           price_weekend = COALESCE($4, price_weekend),
           is_hidden = COALESCE($5, is_hidden)
       WHERE id = $1
       RETURNING id, owner_id, title, description,
                 price_hour, price_weekend,
                 is_hidden, created_at;`,
      [
        itemId,
        title != null ? String(title) : null,
        description != null ? String(description) : null,
        priceNum,
        isHidden != null ? Boolean(isHidden) : null,
      ],
    );

    const row = updated.rows[0];
    const item = {
      id: row.id,
      ownerId: row.owner_id,
      title: row.title,
      description: row.description ?? "",
      priceHour: row.price_hour != null ? Number(row.price_hour) : null,
      priceWeekend: row.price_weekend != null ? Number(row.price_weekend) : null,
      price: row.price_hour != null ? Number(row.price_hour) : null,
      isHidden: Boolean(row.is_hidden),
      createdAt: row.created_at,
    };

    return res.json({ item });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function hideOwnerItem(req, res) {
  try {
    const ownerId = req.user.id;
    const { itemId } = req.params;

    const itemRes = await pool.query(
      `SELECT id, owner_id
       FROM items
       WHERE id = $1;`,
      [itemId],
    );
    if (itemRes.rowCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }
    if (itemRes.rows[0].owner_id !== ownerId) {
      return res.status(403).json({ error: "Not your item" });
    }

    await pool.query(
      `UPDATE items
       SET is_hidden = true
       WHERE id = $1;`,
      [itemId],
    );

    return res.json({ itemId, isHidden: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { createOwnerItem, updateOwnerItem, hideOwnerItem };

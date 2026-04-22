const { parseISODateOnly, toTime } = require("../../utils/dates");
const pool = require("../../db");
const { randomUUID } = require("crypto");

function parseMoney(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

async function listItems(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, owner_id, title, description,
              photo_url, video_url,
              price_hour, price_weekend,
              is_hidden, created_at
       FROM items
       WHERE is_hidden = false
       ORDER BY created_at DESC;`,
      [],
    );

    const items = result.rows.map((r) => ({
      id: r.id,
      ownerId: r.owner_id,
      title: r.title,
      description: r.description ?? "",
      photoUrl: r.photo_url ?? null,
      videoUrl: r.video_url ?? null,
      priceHour: r.price_hour != null ? Number(r.price_hour) : null,
      priceWeekend: r.price_weekend != null ? Number(r.price_weekend) : null,
      price: r.price_hour != null ? Number(r.price_hour) : r.price_weekend != null ? Number(r.price_weekend) : null,
      isHidden: Boolean(r.is_hidden),
      createdAt: r.created_at,
    }));

    return res.json({ items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function getItemAvailability(req, res) {
  try {
    const { itemId } = req.params;
    const dateFrom = parseISODateOnly(req.query.dateFrom);
    const dateTo = parseISODateOnly(req.query.dateTo);

    if (!dateFrom || !dateTo) {
      return res
        .status(400)
        .json({ error: "dateFrom and dateTo must be YYYY-MM-DD" });
    }
    if (toTime(dateFrom) >= toTime(dateTo)) {
      return res.status(400).json({ error: "dateFrom must be < dateTo" });
    }

    const itemCheck = await pool.query(
      `SELECT 1
       FROM items
       WHERE id = $1 AND is_hidden = false;`,
      [itemId],
    );
    if (itemCheck.rowCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const newFrom = new Date(toTime(dateFrom));
    const newTo = new Date(toTime(dateTo));

    const conflictsRes = await pool.query(
      `SELECT id
       FROM bookings
       WHERE item_id = $1
         AND status IN ('pending', 'approved')
         AND NOT (end_at <= $2 OR start_at >= $3);`,
      [itemId, newFrom, newTo],
    );

    return res.json({
      available: conflictsRes.rowCount === 0,
      conflicts: conflictsRes.rows.map((r) => r.id),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function createItem(req, res) {
  try {
    const b = req.body || {};
    const ownerId = b.owner_id ?? b.ownerId;
    const {
      title,
      description,
      photoUrl,
      videoUrl,
      isHidden,
    } = b;
    const photo_url = b.photo_url ?? photoUrl;
    const video_url = b.video_url ?? videoUrl;
    const priceHour = parseMoney(b.price_hour ?? b.priceHour);
    const priceWeekend = parseMoney(b.price_weekend ?? b.priceWeekend);

    if (!ownerId) {
      return res.status(400).json({ error: "owner_id is required" });
    }
    if (!title) return res.status(400).json({ error: "title is required" });
    if (Number.isNaN(priceHour) || Number.isNaN(priceWeekend)) {
      return res.status(400).json({ error: "price_hour and price_weekend must be numbers" });
    }

    const id = randomUUID();
    const createdAt = new Date();

    const result = await pool.query(
      `INSERT INTO items (
         id, owner_id, title, description, photo_url, video_url,
         price_hour, price_weekend,
         is_hidden, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, owner_id, title, description,
                 photo_url, video_url,
                 price_hour, price_weekend,
                 is_hidden, created_at;`,
      [
        id,
        ownerId,
        String(title),
        description != null ? String(description) : "",
        photo_url != null ? String(photo_url) : null,
        video_url != null ? String(video_url) : null,
        priceHour,
        priceWeekend,
        Boolean(isHidden),
        createdAt,
      ],
    );

    const r = result.rows[0];
    const item = {
      id: r.id,
      ownerId: r.owner_id,
      title: r.title,
      description: r.description ?? "",
      photoUrl: r.photo_url ?? null,
      videoUrl: r.video_url ?? null,
      priceHour: r.price_hour != null ? Number(r.price_hour) : null,
      priceWeekend: r.price_weekend != null ? Number(r.price_weekend) : null,
      isHidden: Boolean(r.is_hidden),
      createdAt: r.created_at,
    };

    return res.status(201).json({ item });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { listItems, createItem, getItemAvailability };

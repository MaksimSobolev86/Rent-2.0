const { randomUUID } = require("crypto");

const pool = require("../../../db");

function parseDecimal(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function parseBoolean(v, fallback = null) {
  if (v === undefined || v === null || v === "") return fallback;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const normalized = v.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return fallback;
}

function mapItemRow(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    owner_id: row.owner_id,
    name: row.name,
    description: row.description ?? "",
    status: row.status ?? null,
    photoUrl: row.photo_url ?? null,
    videoUrl: row.video_url ?? null,
    isForSale: Boolean(row.is_for_sale),
    isForRent: Boolean(row.is_for_rent),
    salePrice: row.sale_price != null ? Number(row.sale_price) : null,
    weekdayPriceHour: row.weekday_price_hour != null ? Number(row.weekday_price_hour) : null,
    weekdayPriceWeek: row.weekday_price_week != null ? Number(row.weekday_price_week) : null,
    weekdayPriceMonth: row.weekday_price_month != null ? Number(row.weekday_price_month) : null,
    weekendPriceHour: row.weekend_price_hour != null ? Number(row.weekend_price_hour) : null,
    weekendPriceWeek: row.weekend_price_week != null ? Number(row.weekend_price_week) : null,
    weekendPriceMonth: row.weekend_price_month != null ? Number(row.weekend_price_month) : null,
    holidayPriceHour: row.holiday_price_hour != null ? Number(row.holiday_price_hour) : null,
    holidayPriceWeek: row.holiday_price_week != null ? Number(row.holiday_price_week) : null,
    holidayPriceMonth: row.holiday_price_month != null ? Number(row.holiday_price_month) : null,
    price: row.price != null ? Number(row.price) : null,
    pricePerHour: row.price_per_hour != null ? Number(row.price_per_hour) : null,
    pricePerWeek: row.price_per_week != null ? Number(row.price_per_week) : null,
    pricePerMonth: row.price_per_month != null ? Number(row.price_per_month) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createOwnerItem(req, res) {
  try {
    const ownerId = req.user.id;
    const b = req.body || {};
    const name = b.name ?? b.title;
    const description = b.description;
    const status = b.status;
    const photoUrl = b.photo_url ?? b.photoUrl;
    const videoUrl = b.video_url ?? b.videoUrl;
    const isForSale = parseBoolean(b.is_for_sale ?? b.isForSale, false);
    const isForRent = parseBoolean(b.is_for_rent ?? b.isForRent, false);
    const salePrice = parseDecimal(b.sale_price ?? b.salePrice);
    const weekdayPriceHour = parseDecimal(b.weekday_price_hour ?? b.weekdayPriceHour);
    const weekdayPriceWeek = parseDecimal(b.weekday_price_week ?? b.weekdayPriceWeek);
    const weekdayPriceMonth = parseDecimal(b.weekday_price_month ?? b.weekdayPriceMonth);
    const weekendPriceHour = parseDecimal(b.weekend_price_hour ?? b.weekendPriceHour);
    const weekendPriceWeek = parseDecimal(b.weekend_price_week ?? b.weekendPriceWeek);
    const weekendPriceMonth = parseDecimal(b.weekend_price_month ?? b.weekendPriceMonth);
    const holidayPriceHour = parseDecimal(b.holiday_price_hour ?? b.holidayPriceHour);
    const holidayPriceWeek = parseDecimal(b.holiday_price_week ?? b.holidayPriceWeek);
    const holidayPriceMonth = parseDecimal(b.holiday_price_month ?? b.holidayPriceMonth);
    const price = parseDecimal(b.price);
    const pricePerHour = parseDecimal(b.price_per_hour ?? b.pricePerHour);
    const pricePerWeek = parseDecimal(b.price_per_week ?? b.pricePerWeek);
    const pricePerMonth = parseDecimal(b.price_per_month ?? b.pricePerMonth);

    if (name == null || String(name).trim() === "") {
      return res.status(400).json({ error: "name is required" });
    }
    if (
      Number.isNaN(price)
      || Number.isNaN(pricePerHour)
      || Number.isNaN(pricePerWeek)
      || Number.isNaN(pricePerMonth)
      || Number.isNaN(salePrice)
      || Number.isNaN(weekdayPriceHour) || Number.isNaN(weekdayPriceWeek) || Number.isNaN(weekdayPriceMonth)
      || Number.isNaN(weekendPriceHour) || Number.isNaN(weekendPriceWeek) || Number.isNaN(weekendPriceMonth)
      || Number.isNaN(holidayPriceHour) || Number.isNaN(holidayPriceWeek) || Number.isNaN(holidayPriceMonth)
    ) {
      return res.status(400).json({ error: "price fields must be numbers" });
    }
    if (isForSale && salePrice == null) {
      return res.status(400).json({ error: "salePrice is required when isForSale is true" });
    }
    if (
      isForRent
      && [weekdayPriceHour, weekdayPriceWeek, weekdayPriceMonth, weekendPriceHour, weekendPriceWeek, weekendPriceMonth, holidayPriceHour, holidayPriceWeek, holidayPriceMonth].every((v) => v == null)
    ) {
      return res.status(400).json({ error: "At least one rent price is required when isForRent is true" });
    }

    const id = randomUUID();
    const now = new Date();

    const result = await pool.query(
      `INSERT INTO items (
         id, owner_id, name, description, status, photo_url, video_url,
         is_for_sale, is_for_rent, sale_price,
         weekday_price_hour, weekday_price_week, weekday_price_month,
         weekend_price_hour, weekend_price_week, weekend_price_month,
         holiday_price_hour, holiday_price_week, holiday_price_month,
         price, price_per_hour, price_per_week, price_per_month, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10,
         $11, $12, $13,
         $14, $15, $16,
         $17, $18, $19,
         $20, $21, $22, $23, $24, $25
       )
       RETURNING id, owner_id, name, description, status, photo_url, video_url,
                 is_for_sale, is_for_rent, sale_price,
                 weekday_price_hour, weekday_price_week, weekday_price_month,
                 weekend_price_hour, weekend_price_week, weekend_price_month,
                 holiday_price_hour, holiday_price_week, holiday_price_month,
                 price, price_per_hour, price_per_week, price_per_month, created_at, updated_at;`,
      [
        id,
        ownerId,
        String(name),
        description != null ? String(description) : "",
        status != null ? String(status) : null,
        photoUrl != null ? String(photoUrl) : null,
        videoUrl != null ? String(videoUrl) : null,
        isForSale,
        isForRent,
        salePrice,
        weekdayPriceHour,
        weekdayPriceWeek,
        weekdayPriceMonth,
        weekendPriceHour,
        weekendPriceWeek,
        weekendPriceMonth,
        holidayPriceHour,
        holidayPriceWeek,
        holidayPriceMonth,
        price,
        pricePerHour,
        pricePerWeek,
        pricePerMonth,
        now,
        now,
      ],
    );

    return res.status(201).json({ item: mapItemRow(result.rows[0]) });
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
      `SELECT id, owner_id
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

    const b = req.body || {};
    const name = b.name ?? b.title;
    const description = b.description;
    const status = b.status;
    const photoUrl = b.photo_url ?? b.photoUrl;
    const videoUrl = b.video_url ?? b.videoUrl;
    const isForSale = parseBoolean(b.is_for_sale ?? b.isForSale);
    const isForRent = parseBoolean(b.is_for_rent ?? b.isForRent);
    const salePrice = parseDecimal(b.sale_price ?? b.salePrice);
    const weekdayPriceHour = parseDecimal(b.weekday_price_hour ?? b.weekdayPriceHour);
    const weekdayPriceWeek = parseDecimal(b.weekday_price_week ?? b.weekdayPriceWeek);
    const weekdayPriceMonth = parseDecimal(b.weekday_price_month ?? b.weekdayPriceMonth);
    const weekendPriceHour = parseDecimal(b.weekend_price_hour ?? b.weekendPriceHour);
    const weekendPriceWeek = parseDecimal(b.weekend_price_week ?? b.weekendPriceWeek);
    const weekendPriceMonth = parseDecimal(b.weekend_price_month ?? b.weekendPriceMonth);
    const holidayPriceHour = parseDecimal(b.holiday_price_hour ?? b.holidayPriceHour);
    const holidayPriceWeek = parseDecimal(b.holiday_price_week ?? b.holidayPriceWeek);
    const holidayPriceMonth = parseDecimal(b.holiday_price_month ?? b.holidayPriceMonth);
    const price = parseDecimal(b.price);
    const pricePerHour = parseDecimal(b.price_per_hour ?? b.pricePerHour);
    const pricePerWeek = parseDecimal(b.price_per_week ?? b.pricePerWeek);
    const pricePerMonth = parseDecimal(b.price_per_month ?? b.pricePerMonth);

    if (
      Number.isNaN(price)
      || Number.isNaN(pricePerHour)
      || Number.isNaN(pricePerWeek)
      || Number.isNaN(pricePerMonth)
      || Number.isNaN(salePrice)
      || Number.isNaN(weekdayPriceHour) || Number.isNaN(weekdayPriceWeek) || Number.isNaN(weekdayPriceMonth)
      || Number.isNaN(weekendPriceHour) || Number.isNaN(weekendPriceWeek) || Number.isNaN(weekendPriceMonth)
      || Number.isNaN(holidayPriceHour) || Number.isNaN(holidayPriceWeek) || Number.isNaN(holidayPriceMonth)
    ) {
      return res.status(400).json({ error: "price fields must be numbers" });
    }

    const updated = await pool.query(
      `UPDATE items
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           status = COALESCE($4, status),
           photo_url = COALESCE($5, photo_url),
           video_url = COALESCE($6, video_url),
           is_for_sale = COALESCE($7, is_for_sale),
           is_for_rent = COALESCE($8, is_for_rent),
           sale_price = COALESCE($9, sale_price),
           weekday_price_hour = COALESCE($10, weekday_price_hour),
           weekday_price_week = COALESCE($11, weekday_price_week),
           weekday_price_month = COALESCE($12, weekday_price_month),
           weekend_price_hour = COALESCE($13, weekend_price_hour),
           weekend_price_week = COALESCE($14, weekend_price_week),
           weekend_price_month = COALESCE($15, weekend_price_month),
           holiday_price_hour = COALESCE($16, holiday_price_hour),
           holiday_price_week = COALESCE($17, holiday_price_week),
           holiday_price_month = COALESCE($18, holiday_price_month),
           price = COALESCE($19, price),
           price_per_hour = COALESCE($20, price_per_hour),
           price_per_week = COALESCE($21, price_per_week),
           price_per_month = COALESCE($22, price_per_month),
           updated_at = now()
       WHERE id = $1
       RETURNING id, owner_id, name, description, status, photo_url, video_url,
                 is_for_sale, is_for_rent, sale_price,
                 weekday_price_hour, weekday_price_week, weekday_price_month,
                 weekend_price_hour, weekend_price_week, weekend_price_month,
                 holiday_price_hour, holiday_price_week, holiday_price_month,
                 price, price_per_hour, price_per_week, price_per_month, created_at, updated_at;`,
      [
        itemId,
        name != null ? String(name) : null,
        description != null ? String(description) : null,
        status != null ? String(status) : null,
        photoUrl != null ? String(photoUrl) : null,
        videoUrl != null ? String(videoUrl) : null,
        isForSale,
        isForRent,
        salePrice,
        weekdayPriceHour,
        weekdayPriceWeek,
        weekdayPriceMonth,
        weekendPriceHour,
        weekendPriceWeek,
        weekendPriceMonth,
        holidayPriceHour,
        holidayPriceWeek,
        holidayPriceMonth,
        price,
        pricePerHour,
        pricePerWeek,
        pricePerMonth,
      ],
    );

    return res.json({ item: mapItemRow(updated.rows[0]) });
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

    const updated = await pool.query(
      `UPDATE items
       SET status = 'hidden', updated_at = now()
       WHERE id = $1
       RETURNING id, owner_id, name, description, status, photo_url, video_url,
                 is_for_sale, is_for_rent, sale_price,
                 weekday_price_hour, weekday_price_week, weekday_price_month,
                 weekend_price_hour, weekend_price_week, weekend_price_month,
                 holiday_price_hour, holiday_price_week, holiday_price_month,
                 price, price_per_hour, price_per_week, price_per_month, created_at, updated_at;`,
      [itemId],
    );

    return res.json({ item: mapItemRow(updated.rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { createOwnerItem, updateOwnerItem, hideOwnerItem };

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

function parseItemMedia(rawMedia) {
  if (rawMedia == null) return { media: null, error: null };
  if (!Array.isArray(rawMedia)) {
    return { media: null, error: "media must be an array" };
  }

  const parsed = [];
  for (let i = 0; i < rawMedia.length; i += 1) {
    const media = rawMedia[i] || {};
    const url = typeof media.url === "string" ? media.url.trim() : "";
    const type = typeof media.type === "string" ? media.type.trim().toLowerCase() : "";
    const sortOrderRaw = media.sortOrder ?? media.sort_order ?? 0;
    const sortOrder = Number(sortOrderRaw);

    if (!url) {
      return { media: null, error: `media[${i}].url is required` };
    }
    if (!["image", "video"].includes(type)) {
      return { media: null, error: `media[${i}].type must be image or video` };
    }
    if (!Number.isInteger(sortOrder)) {
      return { media: null, error: `media[${i}].sortOrder must be an integer` };
    }

    parsed.push({ url, type, sortOrder });
  }

  return { media: parsed, error: null };
}

async function replaceItemMedia(client, ownerId, itemId, media) {
  await client.query(
    `DELETE FROM media
     WHERE owner_id = $1
       AND target_type = 'item'
       AND target_id = $2;`,
    [ownerId, itemId],
  );
  if (!media || media.length === 0) return;

  const values = [];
  const placeholders = [];
  media.forEach((m, index) => {
    const base = index * 5;
    placeholders.push(`($${base + 1}, $${base + 2}, 'item', $${base + 3}, $${base + 4}, $${base + 5})`);
    values.push(ownerId, itemId, m.url, m.type, m.sortOrder);
  });

  await client.query(
    `INSERT INTO media (owner_id, target_id, target_type, url, type, sort_order)
     VALUES ${placeholders.join(", ")};`,
    values,
  );
}

async function fetchItemMediaMap(client, ownerId, itemIds) {
  if (!itemIds.length) return new Map();
  const mediaRes = await client.query(
    `SELECT id, target_id, url, type, sort_order
     FROM media
     WHERE owner_id = $1
       AND target_type = 'item'
       AND target_id = ANY($2::uuid[])
     ORDER BY target_id, sort_order ASC, created_at ASC;`,
    [ownerId, itemIds],
  );

  const map = new Map();
  mediaRes.rows.forEach((row) => {
    if (!map.has(row.target_id)) map.set(row.target_id, []);
    map.get(row.target_id).push({
      id: row.id,
      url: row.url,
      type: row.type,
      sortOrder: row.sort_order,
    });
  });
  return map;
}

function mapItemRow(row, mediaMap = new Map()) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    owner_id: row.owner_id,
    name: row.name,
    description: row.description ?? "",
    status: row.status ?? null,
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
    media: mediaMap.get(row.id) ?? [],
  };
}

async function createOwnerItem(req, res) {
  try {
    const ownerId = req.user.id;
    const b = req.body || {};
    const name = b.name ?? b.title;
    const description = b.description;
    const status = b.status;
    const mediaResult = parseItemMedia(b.media);
    if (mediaResult.error) {
      return res.status(400).json({ error: mediaResult.error });
    }
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

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
      `INSERT INTO items (
         id, owner_id, name, description, status,
         is_for_sale, is_for_rent, sale_price,
         weekday_price_hour, weekday_price_week, weekday_price_month,
         weekend_price_hour, weekend_price_week, weekend_price_month,
         holiday_price_hour, holiday_price_week, holiday_price_month,
         price, price_per_hour, price_per_week, price_per_month, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8,
         $9, $10, $11,
         $12, $13, $14,
         $15, $16, $17,
         $18, $19, $20, $21, $22, $23
       )
       RETURNING id, owner_id, name, description, status,
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
      await replaceItemMedia(client, ownerId, id, mediaResult.media);
      const mediaMap = await fetchItemMediaMap(client, ownerId, [id]);
      await client.query("COMMIT");
      return res.status(201).json({ item: mapItemRow(result.rows[0], mediaMap) });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
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
    const mediaResult = parseItemMedia(b.media);
    if (mediaResult.error) {
      return res.status(400).json({ error: mediaResult.error });
    }
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

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
      `UPDATE items
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           status = COALESCE($4, status),
           is_for_sale = COALESCE($5, is_for_sale),
           is_for_rent = COALESCE($6, is_for_rent),
           sale_price = COALESCE($7, sale_price),
           weekday_price_hour = COALESCE($8, weekday_price_hour),
           weekday_price_week = COALESCE($9, weekday_price_week),
           weekday_price_month = COALESCE($10, weekday_price_month),
           weekend_price_hour = COALESCE($11, weekend_price_hour),
           weekend_price_week = COALESCE($12, weekend_price_week),
           weekend_price_month = COALESCE($13, weekend_price_month),
           holiday_price_hour = COALESCE($14, holiday_price_hour),
           holiday_price_week = COALESCE($15, holiday_price_week),
           holiday_price_month = COALESCE($16, holiday_price_month),
           price = COALESCE($17, price),
           price_per_hour = COALESCE($18, price_per_hour),
           price_per_week = COALESCE($19, price_per_week),
           price_per_month = COALESCE($20, price_per_month),
           updated_at = now()
       WHERE id = $1
       RETURNING id, owner_id, name, description, status,
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
      if (Object.prototype.hasOwnProperty.call(b, "media")) {
        await replaceItemMedia(client, ownerId, itemId, mediaResult.media);
      }
      const mediaMap = await fetchItemMediaMap(client, ownerId, [itemId]);
      await client.query("COMMIT");
      return res.json({ item: mapItemRow(updated.rows[0], mediaMap) });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
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
       RETURNING id, owner_id, name, description, status,
                 is_for_sale, is_for_rent, sale_price,
                 weekday_price_hour, weekday_price_week, weekday_price_month,
                 weekend_price_hour, weekend_price_week, weekend_price_month,
                 holiday_price_hour, holiday_price_week, holiday_price_month,
                 price, price_per_hour, price_per_week, price_per_month, created_at, updated_at;`,
      [itemId],
    );

    const mediaMap = await fetchItemMediaMap(pool, ownerId, [itemId]);
    return res.json({ item: mapItemRow(updated.rows[0], mediaMap) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { createOwnerItem, updateOwnerItem, hideOwnerItem };

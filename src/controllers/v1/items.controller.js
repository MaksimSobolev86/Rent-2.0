const { parseISODateOnly, toTime } = require("../../utils/dates");
const pool = require("../../db");
const { randomUUID } = require("crypto");
const { resolveRentalPrice, resolveOwnerRentalPrice } = require("../../utils/itemPricing");
let dealTypeColumnExistsCache = null;

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

function isUuid(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
    if (!url) return { media: null, error: `media[${i}].url is required` };
    if (!["image", "video"].includes(type)) return { media: null, error: `media[${i}].type must be image or video` };
    if (!Number.isInteger(sortOrder)) return { media: null, error: `media[${i}].sortOrder must be an integer` };
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

async function fetchItemMediaMap(client, itemIds, ownerId = null) {
  if (!itemIds.length) return new Map();
  const mediaRes = await client.query(
    `SELECT id, target_id, url, type, sort_order
     FROM media
     WHERE target_type = 'item'
       AND target_id = ANY($1::uuid[])
       AND ($2::uuid IS NULL OR owner_id = $2::uuid)
     ORDER BY target_id, sort_order ASC, created_at ASC;`,
    [itemIds, ownerId],
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

function mapItemRow(r, mediaMap = new Map()) {
  const inferredDealType = r.deal_type ?? (r.price_per_hour != null || r.price_per_week != null || r.price_per_month != null ? "rent" : "sale");
  return {
    id: r.id,
    ownerId: r.owner_id,
    owner_id: r.owner_id,
    name: r.name,
    dealType: inferredDealType,
    deal_type: inferredDealType,
    description: r.description ?? "",
    status: r.status ?? null,
    isForSale: Boolean(r.is_for_sale),
    is_for_sale: Boolean(r.is_for_sale),
    isForRent: Boolean(r.is_for_rent),
    is_for_rent: Boolean(r.is_for_rent),
    salePrice: r.sale_price != null ? Number(r.sale_price) : null,
    sale_price: r.sale_price != null ? Number(r.sale_price) : null,
    weekdayPriceHour: r.weekday_price_hour != null ? Number(r.weekday_price_hour) : null,
    weekday_price_hour: r.weekday_price_hour != null ? Number(r.weekday_price_hour) : null,
    weekdayPriceWeek: r.weekday_price_week != null ? Number(r.weekday_price_week) : null,
    weekday_price_week: r.weekday_price_week != null ? Number(r.weekday_price_week) : null,
    weekdayPriceMonth: r.weekday_price_month != null ? Number(r.weekday_price_month) : null,
    weekday_price_month: r.weekday_price_month != null ? Number(r.weekday_price_month) : null,
    weekendPriceHour: r.weekend_price_hour != null ? Number(r.weekend_price_hour) : null,
    weekend_price_hour: r.weekend_price_hour != null ? Number(r.weekend_price_hour) : null,
    weekendPriceWeek: r.weekend_price_week != null ? Number(r.weekend_price_week) : null,
    weekend_price_week: r.weekend_price_week != null ? Number(r.weekend_price_week) : null,
    weekendPriceMonth: r.weekend_price_month != null ? Number(r.weekend_price_month) : null,
    weekend_price_month: r.weekend_price_month != null ? Number(r.weekend_price_month) : null,
    holidayPriceHour: r.holiday_price_hour != null ? Number(r.holiday_price_hour) : null,
    holiday_price_hour: r.holiday_price_hour != null ? Number(r.holiday_price_hour) : null,
    holidayPriceWeek: r.holiday_price_week != null ? Number(r.holiday_price_week) : null,
    holiday_price_week: r.holiday_price_week != null ? Number(r.holiday_price_week) : null,
    holidayPriceMonth: r.holiday_price_month != null ? Number(r.holiday_price_month) : null,
    holiday_price_month: r.holiday_price_month != null ? Number(r.holiday_price_month) : null,
    price: r.price != null ? Number(r.price) : null,
    pricePerHour: r.price_per_hour != null ? Number(r.price_per_hour) : null,
    price_per_hour: r.price_per_hour != null ? Number(r.price_per_hour) : null,
    pricePerWeek: r.price_per_week != null ? Number(r.price_per_week) : null,
    price_per_week: r.price_per_week != null ? Number(r.price_per_week) : null,
    pricePerMonth: r.price_per_month != null ? Number(r.price_per_month) : null,
    price_per_month: r.price_per_month != null ? Number(r.price_per_month) : null,
    createdAt: r.created_at,
    created_at: r.created_at,
    updatedAt: r.updated_at,
    updated_at: r.updated_at,
    media: mediaMap.get(r.id) ?? [],
  };
}

async function hasDealTypeColumn() {
  if (dealTypeColumnExistsCache !== null) {
    return dealTypeColumnExistsCache;
  }
  const result = await pool.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'items'
         AND column_name = 'deal_type'
     ) AS exists;`,
    [],
  );
  dealTypeColumnExistsCache = Boolean(result.rows[0]?.exists);
  return dealTypeColumnExistsCache;
}

function parseItemPayload(body) {
  const b = body || {};
  const ownerId = b.owner_id ?? b.ownerId ?? b.client_id ?? b.clientId;
  const name = b.name ?? b.title;
  const dealType = b.deal_type ?? b.dealType;
  const description = b.description;
  const status = b.status;
  const media = b.media;
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
  const pricePerHour = parseDecimal(b.price_per_hour ?? b.pricePerHour ?? b.price_hour ?? b.priceHour);
  const pricePerWeek = parseDecimal(b.price_per_week ?? b.pricePerWeek ?? b.price_week ?? b.priceWeek);
  const pricePerMonth = parseDecimal(b.price_per_month ?? b.pricePerMonth ?? b.price_month ?? b.priceMonth);

  return {
    ownerId,
    name,
    dealType,
    description,
    status,
    media,
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
  };
}

function hasAnyRentPrice(payload) {
  return [
    payload.weekdayPriceHour,
    payload.weekdayPriceWeek,
    payload.weekdayPriceMonth,
    payload.weekendPriceHour,
    payload.weekendPriceWeek,
    payload.weekendPriceMonth,
    payload.holidayPriceHour,
    payload.holidayPriceWeek,
    payload.holidayPriceMonth,
  ].some((v) => v != null);
}

async function listItems(req, res) {
  try {
    const ownerId = req.user?.id;
    const isOwner = req.user?.role === "owner";
    if (isOwner && !ownerId) {
      return res.status(401).json({ error: "Unauthorized owner context" });
    }

    const withDealType = await hasDealTypeColumn();
    const dealTypeSelect = withDealType ? ", deal_type" : "";
    const result = await pool.query(
      `SELECT id, owner_id, name${dealTypeSelect}, description, status,
              is_for_sale, is_for_rent, sale_price,
              weekday_price_hour, weekday_price_week, weekday_price_month,
              weekend_price_hour, weekend_price_week, weekend_price_month,
              holiday_price_hour, holiday_price_week, holiday_price_month,
              price, price_per_hour, price_per_week, price_per_month,
              created_at, updated_at
       FROM items
       WHERE ($1::uuid IS NULL OR owner_id = $1::uuid)
       ORDER BY created_at DESC;`,
      [isOwner ? ownerId : null],
    );

    const mediaMap = await fetchItemMediaMap(pool, result.rows.map((r) => r.id), isOwner ? ownerId : null);
    const items = result.rows.map((r) => mapItemRow(r, mediaMap));

    return res.json({ items });
  } catch (err) {
    if (err && err.code === "23503") {
      return res.status(400).json({ error: "owner_id does not satisfy current foreign key constraint" });
    }
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
       FROM items WHERE id = $1;`,
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
    if (err && err.code === "23503") {
      return res.status(400).json({ error: "owner_id does not satisfy current foreign key constraint" });
    }
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function getItemRentalPrice(req, res) {
  try {
    const { itemId } = req.params;
    const ownerId = req.user?.id;
    const isOwner = req.user?.role === "owner";
    const dayType = req.query.dayType ? req.query.dayType.toString().toLowerCase() : null;
    const date = req.query.date ? req.query.date.toString() : null;
    const period = (req.query.period ?? "").toString().toLowerCase();

    if (!["hour", "week", "month"].includes(period)) {
      return res.status(400).json({ error: "period must be hour, week or month" });
    }
    if (!dayType && !date) {
      return res.status(400).json({ error: "Either dayType or date is required" });
    }
    if (dayType && !["weekday", "weekend", "holiday"].includes(dayType)) {
      return res.status(400).json({ error: "dayType must be weekday, weekend or holiday" });
    }

    const result = await pool.query(
      `SELECT id, owner_id, is_for_rent,
              weekday_price_hour, weekday_price_week, weekday_price_month,
              weekend_price_hour, weekend_price_week, weekend_price_month,
              holiday_price_hour, holiday_price_week, holiday_price_month
       FROM items
       WHERE id = $1
         AND ($2::uuid IS NULL OR owner_id = $2::uuid);`,
      [itemId, isOwner ? ownerId : null],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const row = mapItemRow(result.rows[0]);
    if (!row.is_for_rent) {
      return res.status(400).json({ error: "Item is not configured for rent" });
    }

    const resolved = date
      ? await resolveOwnerRentalPrice(pool, row.ownerId, row, date, period)
      : { dayType, price: resolveRentalPrice(row, dayType, period) };
    const resolvedDayType = resolved.dayType;
    const price = resolved.price;
    if (price == null) {
      return res.status(404).json({ error: "No rental price configured for requested period" });
    }

    return res.json({
      itemId: row.id,
      dayType: resolvedDayType,
      date: date ?? null,
      period,
      price,
      currency: "RUB",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function getItemById(req, res) {
  try {
    const { itemId } = req.params;
    const ownerId = req.user?.id;
    const isOwner = req.user?.role === "owner";
    const withDealType = await hasDealTypeColumn();
    const dealTypeSelect = withDealType ? ", deal_type" : "";
    const result = await pool.query(
      `SELECT id, owner_id, name${dealTypeSelect}, description, status,
              is_for_sale, is_for_rent, sale_price,
              weekday_price_hour, weekday_price_week, weekday_price_month,
              weekend_price_hour, weekend_price_week, weekend_price_month,
              holiday_price_hour, holiday_price_week, holiday_price_month,
              price, price_per_hour, price_per_week, price_per_month,
              created_at, updated_at
       FROM items
       WHERE id = $1
         AND ($2::uuid IS NULL OR owner_id = $2::uuid);`,
      [itemId, isOwner ? ownerId : null],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const mediaMap = await fetchItemMediaMap(pool, [result.rows[0].id], isOwner ? ownerId : null);
    return res.json({ item: mapItemRow(result.rows[0], mediaMap) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function createItem(req, res) {
  try {
    const payload = parseItemPayload(req.body);
    const {
      name,
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
      description,
      status,
      price,
      pricePerHour,
      pricePerWeek,
      pricePerMonth,
    } = payload;
    const mediaResult = parseItemMedia(payload.media);
    if (mediaResult.error) {
      return res.status(400).json({ error: mediaResult.error });
    }

    const ownerFromAuth = req.user?.id;
    const effectiveOwnerId = ownerFromAuth;

    if (!effectiveOwnerId) {
      return res.status(400).json({ error: "owner_id is required" });
    }
    if (!isUuid(String(effectiveOwnerId))) {
      return res.status(400).json({ error: "owner_id must be a valid UUID" });
    }
    if (name == null || String(name).trim() === "") {
      return res.status(400).json({ error: "name is required" });
    }
    if (
      Number.isNaN(price) || Number.isNaN(pricePerHour) || Number.isNaN(pricePerWeek) || Number.isNaN(pricePerMonth)
      || Number.isNaN(salePrice)
      || Number.isNaN(weekdayPriceHour) || Number.isNaN(weekdayPriceWeek) || Number.isNaN(weekdayPriceMonth)
      || Number.isNaN(weekendPriceHour) || Number.isNaN(weekendPriceWeek) || Number.isNaN(weekendPriceMonth)
      || Number.isNaN(holidayPriceHour) || Number.isNaN(holidayPriceWeek) || Number.isNaN(holidayPriceMonth)
    ) {
      return res.status(400).json({ error: "price fields must be numbers" });
    }
    if (isForSale === true && salePrice == null) {
      return res.status(400).json({ error: "salePrice is required when isForSale is true" });
    }
    if (isForRent === true && !hasAnyRentPrice({
      weekdayPriceHour, weekdayPriceWeek, weekdayPriceMonth,
      weekendPriceHour, weekendPriceWeek, weekendPriceMonth,
      holidayPriceHour, holidayPriceWeek, holidayPriceMonth,
    })) {
      return res.status(400).json({ error: "At least one rent price is required when isForRent is true" });
    }

    const ownerCheck = await pool.query(`SELECT 1 FROM owners WHERE id = $1;`, [String(effectiveOwnerId)]);
    if (ownerCheck.rowCount === 0) {
      return res.status(400).json({ error: "Owner not found" });
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
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
       )
       RETURNING id, owner_id, name, description, status,
                 is_for_sale, is_for_rent, sale_price,
                 weekday_price_hour, weekday_price_week, weekday_price_month,
                 weekend_price_hour, weekend_price_week, weekend_price_month,
                 holiday_price_hour, holiday_price_week, holiday_price_month,
                 price, price_per_hour, price_per_week, price_per_month, created_at, updated_at;`,
      [
        id,
        String(effectiveOwnerId),
        String(name),
        description != null ? String(description) : "",
        status != null ? String(status) : null,
        isForSale === true,
        isForRent === true,
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
      await replaceItemMedia(client, String(effectiveOwnerId), id, mediaResult.media);
      const mediaMap = await fetchItemMediaMap(client, [id], String(effectiveOwnerId));
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

async function updateItem(req, res) {
  try {
    const { itemId } = req.params;
    const updates = parseItemPayload(req.body);
    const mediaResult = parseItemMedia(updates.media);
    if (mediaResult.error) {
      return res.status(400).json({ error: mediaResult.error });
    }
    const ownerId = req.user?.id;
    const isOwner = req.user?.role === "owner";
    const existing = await pool.query(
      `SELECT id, owner_id, is_for_sale, is_for_rent, sale_price,
              weekday_price_hour, weekday_price_week, weekday_price_month,
              weekend_price_hour, weekend_price_week, weekend_price_month,
              holiday_price_hour, holiday_price_week, holiday_price_month
       FROM items
       WHERE id = $1
         AND ($2::uuid IS NULL OR owner_id = $2::uuid);`,
      [itemId, isOwner ? ownerId : null],
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (updates.ownerId != null && req.user?.role !== "owner") {
      if (!isUuid(String(updates.ownerId))) {
        return res.status(400).json({ error: "owner_id must be a valid UUID" });
      }
      const ownerCheck = await pool.query(`SELECT 1 FROM owners WHERE id = $1;`, [String(updates.ownerId)]);
      if (ownerCheck.rowCount === 0) {
        return res.status(400).json({ error: "Owner not found" });
      }
    }

    if (updates.name != null && String(updates.name).trim() === "") {
      return res.status(400).json({ error: "name cannot be empty" });
    }
    if (
      Number.isNaN(updates.price)
      || Number.isNaN(updates.pricePerHour)
      || Number.isNaN(updates.pricePerWeek)
      || Number.isNaN(updates.pricePerMonth)
      || Number.isNaN(updates.salePrice)
      || Number.isNaN(updates.weekdayPriceHour) || Number.isNaN(updates.weekdayPriceWeek) || Number.isNaN(updates.weekdayPriceMonth)
      || Number.isNaN(updates.weekendPriceHour) || Number.isNaN(updates.weekendPriceWeek) || Number.isNaN(updates.weekendPriceMonth)
      || Number.isNaN(updates.holidayPriceHour) || Number.isNaN(updates.holidayPriceWeek) || Number.isNaN(updates.holidayPriceMonth)
    ) {
      return res.status(400).json({ error: "price fields must be numbers" });
    }

    const current = existing.rows[0];
    const finalPricingState = {
      isForSale: updates.isForSale != null ? updates.isForSale : Boolean(current.is_for_sale),
      isForRent: updates.isForRent != null ? updates.isForRent : Boolean(current.is_for_rent),
      salePrice: updates.salePrice != null ? updates.salePrice : (current.sale_price != null ? Number(current.sale_price) : null),
      weekdayPriceHour: updates.weekdayPriceHour != null ? updates.weekdayPriceHour : (current.weekday_price_hour != null ? Number(current.weekday_price_hour) : null),
      weekdayPriceWeek: updates.weekdayPriceWeek != null ? updates.weekdayPriceWeek : (current.weekday_price_week != null ? Number(current.weekday_price_week) : null),
      weekdayPriceMonth: updates.weekdayPriceMonth != null ? updates.weekdayPriceMonth : (current.weekday_price_month != null ? Number(current.weekday_price_month) : null),
      weekendPriceHour: updates.weekendPriceHour != null ? updates.weekendPriceHour : (current.weekend_price_hour != null ? Number(current.weekend_price_hour) : null),
      weekendPriceWeek: updates.weekendPriceWeek != null ? updates.weekendPriceWeek : (current.weekend_price_week != null ? Number(current.weekend_price_week) : null),
      weekendPriceMonth: updates.weekendPriceMonth != null ? updates.weekendPriceMonth : (current.weekend_price_month != null ? Number(current.weekend_price_month) : null),
      holidayPriceHour: updates.holidayPriceHour != null ? updates.holidayPriceHour : (current.holiday_price_hour != null ? Number(current.holiday_price_hour) : null),
      holidayPriceWeek: updates.holidayPriceWeek != null ? updates.holidayPriceWeek : (current.holiday_price_week != null ? Number(current.holiday_price_week) : null),
      holidayPriceMonth: updates.holidayPriceMonth != null ? updates.holidayPriceMonth : (current.holiday_price_month != null ? Number(current.holiday_price_month) : null),
    };

    if (finalPricingState.isForSale === true && finalPricingState.salePrice == null) {
      return res.status(400).json({ error: "salePrice is required when isForSale is true" });
    }
    if (finalPricingState.isForRent === true && !hasAnyRentPrice(finalPricingState)) {
      return res.status(400).json({ error: "At least one rent price is required when isForRent is true" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
      `UPDATE items
       SET owner_id = COALESCE($2, owner_id),
           name = COALESCE($3, name),
           description = COALESCE($4, description),
           status = COALESCE($5, status),
           is_for_sale = COALESCE($6, is_for_sale),
           is_for_rent = COALESCE($7, is_for_rent),
           sale_price = COALESCE($8, sale_price),
           weekday_price_hour = COALESCE($9, weekday_price_hour),
           weekday_price_week = COALESCE($10, weekday_price_week),
           weekday_price_month = COALESCE($11, weekday_price_month),
           weekend_price_hour = COALESCE($12, weekend_price_hour),
           weekend_price_week = COALESCE($13, weekend_price_week),
           weekend_price_month = COALESCE($14, weekend_price_month),
           holiday_price_hour = COALESCE($15, holiday_price_hour),
           holiday_price_week = COALESCE($16, holiday_price_week),
           holiday_price_month = COALESCE($17, holiday_price_month),
           price = COALESCE($18, price),
           price_per_hour = COALESCE($19, price_per_hour),
           price_per_week = COALESCE($20, price_per_week),
           price_per_month = COALESCE($21, price_per_month),
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
        req.user?.role === "owner" ? null : updates.ownerId != null ? String(updates.ownerId) : null,
        updates.name != null ? String(updates.name) : null,
        updates.description != null ? String(updates.description) : null,
        updates.status != null ? String(updates.status) : null,
        updates.isForSale,
        updates.isForRent,
        updates.salePrice,
        updates.weekdayPriceHour,
        updates.weekdayPriceWeek,
        updates.weekdayPriceMonth,
        updates.weekendPriceHour,
        updates.weekendPriceWeek,
        updates.weekendPriceMonth,
        updates.holidayPriceHour,
        updates.holidayPriceWeek,
        updates.holidayPriceMonth,
        updates.price,
        updates.pricePerHour,
        updates.pricePerWeek,
        updates.pricePerMonth,
      ],
    );
      const effectiveMediaOwnerId = String(existing.rows[0].owner_id);
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "media")) {
        await replaceItemMedia(client, effectiveMediaOwnerId, itemId, mediaResult.media);
      }
      const mediaMap = await fetchItemMediaMap(client, [itemId], effectiveMediaOwnerId);
      await client.query("COMMIT");
      return res.json({ item: mapItemRow(result.rows[0], mediaMap) });
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

module.exports = { listItems, getItemById, createItem, updateItem, getItemAvailability, getItemRentalPrice };

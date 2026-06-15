const { parseISODateOnly, toTime } = require("../../utils/dates");
const { getScopedOwnerId, isOwnerLikeRole, resolveCatalogOwnerId } = require("../../utils/ownerScope");
const pool = require("../../db");
const { randomUUID } = require("crypto");
const { resolveRentalPrice, resolveOwnerRentalPrice } = require("../../utils/itemPricing");
const { clientCatalogStatusSql } = require("../../utils/itemCatalog");
const { hasDealTypeColumn } = require("../../utils/itemSchema");
const { ensureItemGroupsSchema } = require("../../utils/ensureItemGroupsSchema");
const { roundMoney } = require("../../utils/money");

const CATALOG_ITEM_SELECT = `
  i.id, i.owner_id, i.name, i.description, i.status,
  i.is_for_sale, i.is_for_rent, i.sale_price,
  i.weekday_price_hour, i.weekday_price_day, i.weekday_price_week, i.weekday_price_month,
  i.weekend_price_hour, i.weekend_price_day, i.weekend_price_week, i.weekend_price_month,
  i.holiday_price_hour, i.holiday_price_day, i.holiday_price_week, i.holiday_price_month,
  i.price, i.price_per_hour, i.price_per_day, i.price_per_week, i.price_per_month,
  i.group_id, g.name AS group_name,
  i.created_at, i.updated_at`;

const CATALOG_ITEM_FROM = `
  FROM items i
  LEFT JOIN item_groups g ON g.id = i.group_id AND g.owner_id = i.owner_id`;

function parseDecimal(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? roundMoney(n) : NaN;
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
  const isForSale = Boolean(r.is_for_sale);
  const isForRent = Boolean(r.is_for_rent);
  const hideRentPrices = isForSale && !isForRent;
  const dealType =
    r.deal_type
    ?? (isForRent && !isForSale
      ? "rent"
      : isForSale && !isForRent
        ? "sale"
        : r.price_per_hour != null || r.price_per_week != null || r.price_per_month != null
          ? "rent"
          : "sale");

  return {
    id: r.id,
    ownerId: r.owner_id,
    owner_id: r.owner_id,
    name: r.name,
    title: r.name,
    dealType,
    deal_type: dealType,
    description: r.description ?? "",
    status: r.status ?? null,
    isForSale,
    is_for_sale: isForSale,
    isForRent,
    is_for_rent: isForRent,
    salePrice: r.sale_price != null ? Number(r.sale_price) : null,
    sale_price: r.sale_price != null ? Number(r.sale_price) : null,
    weekdayPriceHour: hideRentPrices || r.weekday_price_hour == null ? null : Number(r.weekday_price_hour),
    weekday_price_hour: hideRentPrices || r.weekday_price_hour == null ? null : Number(r.weekday_price_hour),
    weekdayPriceDay: hideRentPrices || r.weekday_price_day == null ? null : Number(r.weekday_price_day),
    weekday_price_day: hideRentPrices || r.weekday_price_day == null ? null : Number(r.weekday_price_day),
    weekdayPriceWeek: hideRentPrices || r.weekday_price_week == null ? null : Number(r.weekday_price_week),
    weekday_price_week: hideRentPrices || r.weekday_price_week == null ? null : Number(r.weekday_price_week),
    weekdayPriceMonth: hideRentPrices || r.weekday_price_month == null ? null : Number(r.weekday_price_month),
    weekday_price_month: hideRentPrices || r.weekday_price_month == null ? null : Number(r.weekday_price_month),
    weekendPriceHour: hideRentPrices || r.weekend_price_hour == null ? null : Number(r.weekend_price_hour),
    weekend_price_hour: hideRentPrices || r.weekend_price_hour == null ? null : Number(r.weekend_price_hour),
    weekendPriceDay: hideRentPrices || r.weekend_price_day == null ? null : Number(r.weekend_price_day),
    weekend_price_day: hideRentPrices || r.weekend_price_day == null ? null : Number(r.weekend_price_day),
    weekendPriceWeek: hideRentPrices || r.weekend_price_week == null ? null : Number(r.weekend_price_week),
    weekend_price_week: hideRentPrices || r.weekend_price_week == null ? null : Number(r.weekend_price_week),
    weekendPriceMonth: hideRentPrices || r.weekend_price_month == null ? null : Number(r.weekend_price_month),
    weekend_price_month: hideRentPrices || r.weekend_price_month == null ? null : Number(r.weekend_price_month),
    holidayPriceHour: hideRentPrices || r.holiday_price_hour == null ? null : Number(r.holiday_price_hour),
    holiday_price_hour: hideRentPrices || r.holiday_price_hour == null ? null : Number(r.holiday_price_hour),
    holidayPriceDay: hideRentPrices || r.holiday_price_day == null ? null : Number(r.holiday_price_day),
    holiday_price_day: hideRentPrices || r.holiday_price_day == null ? null : Number(r.holiday_price_day),
    holidayPriceWeek: hideRentPrices || r.holiday_price_week == null ? null : Number(r.holiday_price_week),
    holiday_price_week: hideRentPrices || r.holiday_price_week == null ? null : Number(r.holiday_price_week),
    holidayPriceMonth: hideRentPrices || r.holiday_price_month == null ? null : Number(r.holiday_price_month),
    holiday_price_month: hideRentPrices || r.holiday_price_month == null ? null : Number(r.holiday_price_month),
    price: hideRentPrices
      ? (r.sale_price != null ? Number(r.sale_price) : r.price != null ? Number(r.price) : null)
      : r.price != null
        ? Number(r.price)
        : null,
    pricePerHour: null,
    price_per_hour: null,
    pricePerDay: null,
    price_per_day: null,
    pricePerWeek: null,
    price_per_week: null,
    pricePerMonth: null,
    price_per_month: null,
    createdAt: r.created_at,
    created_at: r.created_at,
    groupId: r.group_id ?? null,
    group_id: r.group_id ?? null,
    groupName: r.group_name ?? null,
    group_name: r.group_name ?? null,
    updatedAt: r.updated_at,
    updated_at: r.updated_at,
    media: mediaMap.get(r.id) ?? [],
  };
}

async function listCatalogItemGroups(req, res) {
  try {
    await ensureItemGroupsSchema();
    const ownerId = resolveCatalogOwnerId(req);
    if (!ownerId) {
      return res.status(400).json({ error: "ownerId query parameter is required" });
    }

    const result = await pool.query(
      `SELECT g.id, g.name, g.sort_order,
              COUNT(i.id)::int AS item_count
       FROM item_groups g
       LEFT JOIN items i
         ON i.group_id = g.id
        AND i.owner_id = g.owner_id
        AND ${clientCatalogStatusSql("i")}
       WHERE g.owner_id = $1::uuid
       GROUP BY g.id
       HAVING COUNT(i.id) > 0
       ORDER BY g.sort_order ASC, g.name ASC;`,
      [ownerId],
    );

    return res.json({
      groups: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        sortOrder: row.sort_order,
        itemCount: Number(row.item_count),
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
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
  const weekdayPriceDay = parseDecimal(b.weekday_price_day ?? b.weekdayPriceDay);
  const weekdayPriceWeek = parseDecimal(b.weekday_price_week ?? b.weekdayPriceWeek);
  const weekdayPriceMonth = parseDecimal(b.weekday_price_month ?? b.weekdayPriceMonth);
  const weekendPriceHour = parseDecimal(b.weekend_price_hour ?? b.weekendPriceHour);
  const weekendPriceDay = parseDecimal(b.weekend_price_day ?? b.weekendPriceDay);
  const weekendPriceWeek = parseDecimal(b.weekend_price_week ?? b.weekendPriceWeek);
  const weekendPriceMonth = parseDecimal(b.weekend_price_month ?? b.weekendPriceMonth);
  const holidayPriceHour = parseDecimal(b.holiday_price_hour ?? b.holidayPriceHour);
  const holidayPriceDay = parseDecimal(b.holiday_price_day ?? b.holidayPriceDay);
  const holidayPriceWeek = parseDecimal(b.holiday_price_week ?? b.holidayPriceWeek);
  const holidayPriceMonth = parseDecimal(b.holiday_price_month ?? b.holidayPriceMonth);
  const price = parseDecimal(b.price);
  const pricePerHour = parseDecimal(b.price_per_hour ?? b.pricePerHour ?? b.price_hour ?? b.priceHour);
  const pricePerDay = parseDecimal(b.price_per_day ?? b.pricePerDay ?? b.price_day ?? b.priceDay);
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
    weekdayPriceDay,
    weekdayPriceWeek,
    weekdayPriceMonth,
    weekendPriceHour,
    weekendPriceDay,
    weekendPriceWeek,
    weekendPriceMonth,
    holidayPriceHour,
    holidayPriceDay,
    holidayPriceWeek,
    holidayPriceMonth,
    price,
    pricePerHour,
    pricePerDay,
    pricePerWeek,
    pricePerMonth,
  };
}

function hasAnyRentPrice(payload) {
  return [
    payload.weekdayPriceHour,
    payload.weekdayPriceDay,
    payload.weekdayPriceWeek,
    payload.weekdayPriceMonth,
    payload.weekendPriceHour,
    payload.weekendPriceDay,
    payload.weekendPriceWeek,
    payload.weekendPriceMonth,
    payload.holidayPriceHour,
    payload.holidayPriceDay,
    payload.holidayPriceWeek,
    payload.holidayPriceMonth,
  ].some((v) => v != null);
}

async function listItems(req, res) {
  try {
    await ensureItemGroupsSchema();
    const scopedOwnerId = getScopedOwnerId(req);
    if (isOwnerLikeRole(req) && !scopedOwnerId) {
      return res.status(401).json({ error: "Unauthorized owner context" });
    }

    const ownerId = resolveCatalogOwnerId(req);
    if (!ownerId) {
      return res.status(400).json({ error: "ownerId query parameter is required" });
    }

    const withDealType = await hasDealTypeColumn();
    const dealTypeSelect = withDealType ? ", i.deal_type" : "";
    const result = await pool.query(
      `SELECT ${CATALOG_ITEM_SELECT}${dealTypeSelect}
       ${CATALOG_ITEM_FROM}
       WHERE i.owner_id = $1::uuid
         AND ${clientCatalogStatusSql("i")}
       ORDER BY g.name ASC NULLS LAST, i.created_at DESC;`,
      [ownerId],
    );

    const mediaMap = await fetchItemMediaMap(pool, result.rows.map((r) => r.id), ownerId);
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
       FROM items
       WHERE id = $1
         AND ${clientCatalogStatusSql()};`,
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

async function getItemBookedSlots(req, res) {
  try {
    const { itemId } = req.params;
    const ownerId = req.query.ownerId ?? null;

    const itemCheck = await pool.query(
      `SELECT id
       FROM items
       WHERE id = $1
         AND ($2::uuid IS NULL OR owner_id = $2::uuid)
         AND ${clientCatalogStatusSql()};`,
      [itemId, ownerId],
    );
    if (itemCheck.rowCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const result = await pool.query(
      `SELECT id, start_at, end_at, status
       FROM bookings
       WHERE item_id = $1
         AND type = 'rent'
         AND status IN ('pending', 'confirmed')
       ORDER BY start_at ASC;`,
      [itemId],
    );

    return res.json({
      bookedSlots: result.rows.map((row) => ({
        id: row.id,
        startAt: row.start_at,
        endAt: row.end_at,
        status: row.status,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function getItemRentalPrice(req, res) {
  try {
    const { itemId } = req.params;
    const scopedOwnerId = getScopedOwnerId(req);
    const dayType = req.query.dayType ? req.query.dayType.toString().toLowerCase() : null;
    const date = req.query.date ? req.query.date.toString() : null;
    const period = (req.query.period ?? "").toString().toLowerCase();

    if (!["hour", "day", "week", "month"].includes(period)) {
      return res.status(400).json({ error: "period must be hour, day, week or month" });
    }
    if (!dayType && !date) {
      return res.status(400).json({ error: "Either dayType or date is required" });
    }
    if (dayType && !["weekday", "weekend", "holiday"].includes(dayType)) {
      return res.status(400).json({ error: "dayType must be weekday, weekend or holiday" });
    }

    const result = await pool.query(
      `SELECT id, owner_id, is_for_rent,
              weekday_price_hour, weekday_price_day, weekday_price_week, weekday_price_month,
              weekend_price_hour, weekend_price_day, weekend_price_week, weekend_price_month,
              holiday_price_hour, holiday_price_day, holiday_price_week, holiday_price_month
       FROM items
       WHERE id = $1
         AND ($2::uuid IS NULL OR owner_id = $2::uuid)
         AND ${clientCatalogStatusSql()};`,
      [itemId, scopedOwnerId],
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
    const ownerId = resolveCatalogOwnerId(req);
    if (!ownerId) {
      return res.status(400).json({ error: "ownerId query parameter is required" });
    }
    const withDealType = await hasDealTypeColumn();
    const dealTypeSelect = withDealType ? ", deal_type" : "";
    const result = await pool.query(
      `SELECT id, owner_id, name${dealTypeSelect}, description, status,
              is_for_sale, is_for_rent, sale_price,
              weekday_price_hour, weekday_price_day, weekday_price_week, weekday_price_month,
              weekend_price_hour, weekend_price_day, weekend_price_week, weekend_price_month,
              holiday_price_hour, holiday_price_day, holiday_price_week, holiday_price_month,
              price, price_per_hour, price_per_day, price_per_week, price_per_month,
              created_at, updated_at
       FROM items
       WHERE id = $1
         AND owner_id = $2::uuid
         AND ${clientCatalogStatusSql()};`,
      [itemId, ownerId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const mediaMap = await fetchItemMediaMap(pool, [result.rows[0].id], ownerId);
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
      weekdayPriceDay,
      weekdayPriceWeek,
      weekdayPriceMonth,
      weekendPriceHour,
      weekendPriceDay,
      weekendPriceWeek,
      weekendPriceMonth,
      holidayPriceHour,
      holidayPriceDay,
      holidayPriceWeek,
      holidayPriceMonth,
      description,
      status,
      price,
      pricePerHour,
      pricePerDay,
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
      Number.isNaN(price) || Number.isNaN(pricePerHour) || Number.isNaN(pricePerDay) || Number.isNaN(pricePerWeek) || Number.isNaN(pricePerMonth)
      || Number.isNaN(salePrice)
      || Number.isNaN(weekdayPriceHour) || Number.isNaN(weekdayPriceDay) || Number.isNaN(weekdayPriceWeek) || Number.isNaN(weekdayPriceMonth)
      || Number.isNaN(weekendPriceHour) || Number.isNaN(weekendPriceDay) || Number.isNaN(weekendPriceWeek) || Number.isNaN(weekendPriceMonth)
      || Number.isNaN(holidayPriceHour) || Number.isNaN(holidayPriceDay) || Number.isNaN(holidayPriceWeek) || Number.isNaN(holidayPriceMonth)
    ) {
      return res.status(400).json({ error: "price fields must be numbers" });
    }
    if (isForSale === true && salePrice == null) {
      return res.status(400).json({ error: "salePrice is required when isForSale is true" });
    }
    if (isForRent === true && !hasAnyRentPrice({
      weekdayPriceHour, weekdayPriceDay, weekdayPriceWeek, weekdayPriceMonth,
      weekendPriceHour, weekendPriceDay, weekendPriceWeek, weekendPriceMonth,
      holidayPriceHour, holidayPriceDay, holidayPriceWeek, holidayPriceMonth,
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
         weekday_price_hour, weekday_price_day, weekday_price_week, weekday_price_month,
         weekend_price_hour, weekend_price_day, weekend_price_week, weekend_price_month,
         holiday_price_hour, holiday_price_day, holiday_price_week, holiday_price_month,
         price, price_per_hour, price_per_day, price_per_week, price_per_month, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
       )
       RETURNING id, owner_id, name, description, status,
                 is_for_sale, is_for_rent, sale_price,
                 weekday_price_hour, weekday_price_day, weekday_price_week, weekday_price_month,
                 weekend_price_hour, weekend_price_day, weekend_price_week, weekend_price_month,
                 holiday_price_hour, holiday_price_day, holiday_price_week, holiday_price_month,
                 price, price_per_hour, price_per_day, price_per_week, price_per_month, created_at, updated_at;`,
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
        weekdayPriceDay,
        weekdayPriceWeek,
        weekdayPriceMonth,
        weekendPriceHour,
        weekendPriceDay,
        weekendPriceWeek,
        weekendPriceMonth,
        holidayPriceHour,
        holidayPriceDay,
        holidayPriceWeek,
        holidayPriceMonth,
        price,
        pricePerHour,
        pricePerDay,
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
    const scopedOwnerId = getScopedOwnerId(req);
    const existing = await pool.query(
      `SELECT id, owner_id, is_for_sale, is_for_rent, sale_price,
              weekday_price_hour, weekday_price_day, weekday_price_week, weekday_price_month,
              weekend_price_hour, weekend_price_day, weekend_price_week, weekend_price_month,
              holiday_price_hour, holiday_price_day, holiday_price_week, holiday_price_month
       FROM items
       WHERE id = $1
         AND ($2::uuid IS NULL OR owner_id = $2::uuid);`,
      [itemId, scopedOwnerId],
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (updates.ownerId != null && !isOwnerLikeRole(req)) {
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
      || Number.isNaN(updates.pricePerDay)
      || Number.isNaN(updates.pricePerWeek)
      || Number.isNaN(updates.pricePerMonth)
      || Number.isNaN(updates.salePrice)
      || Number.isNaN(updates.weekdayPriceHour) || Number.isNaN(updates.weekdayPriceDay) || Number.isNaN(updates.weekdayPriceWeek) || Number.isNaN(updates.weekdayPriceMonth)
      || Number.isNaN(updates.weekendPriceHour) || Number.isNaN(updates.weekendPriceDay) || Number.isNaN(updates.weekendPriceWeek) || Number.isNaN(updates.weekendPriceMonth)
      || Number.isNaN(updates.holidayPriceHour) || Number.isNaN(updates.holidayPriceDay) || Number.isNaN(updates.holidayPriceWeek) || Number.isNaN(updates.holidayPriceMonth)
    ) {
      return res.status(400).json({ error: "price fields must be numbers" });
    }

    const current = existing.rows[0];
    const finalPricingState = {
      isForSale: updates.isForSale != null ? updates.isForSale : Boolean(current.is_for_sale),
      isForRent: updates.isForRent != null ? updates.isForRent : Boolean(current.is_for_rent),
      salePrice: updates.salePrice != null ? updates.salePrice : (current.sale_price != null ? Number(current.sale_price) : null),
      weekdayPriceHour: updates.weekdayPriceHour != null ? updates.weekdayPriceHour : (current.weekday_price_hour != null ? Number(current.weekday_price_hour) : null),
      weekdayPriceDay: updates.weekdayPriceDay != null ? updates.weekdayPriceDay : (current.weekday_price_day != null ? Number(current.weekday_price_day) : null),
      weekdayPriceWeek: updates.weekdayPriceWeek != null ? updates.weekdayPriceWeek : (current.weekday_price_week != null ? Number(current.weekday_price_week) : null),
      weekdayPriceMonth: updates.weekdayPriceMonth != null ? updates.weekdayPriceMonth : (current.weekday_price_month != null ? Number(current.weekday_price_month) : null),
      weekendPriceHour: updates.weekendPriceHour != null ? updates.weekendPriceHour : (current.weekend_price_hour != null ? Number(current.weekend_price_hour) : null),
      weekendPriceDay: updates.weekendPriceDay != null ? updates.weekendPriceDay : (current.weekend_price_day != null ? Number(current.weekend_price_day) : null),
      weekendPriceWeek: updates.weekendPriceWeek != null ? updates.weekendPriceWeek : (current.weekend_price_week != null ? Number(current.weekend_price_week) : null),
      weekendPriceMonth: updates.weekendPriceMonth != null ? updates.weekendPriceMonth : (current.weekend_price_month != null ? Number(current.weekend_price_month) : null),
      holidayPriceHour: updates.holidayPriceHour != null ? updates.holidayPriceHour : (current.holiday_price_hour != null ? Number(current.holiday_price_hour) : null),
      holidayPriceDay: updates.holidayPriceDay != null ? updates.holidayPriceDay : (current.holiday_price_day != null ? Number(current.holiday_price_day) : null),
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
           weekday_price_day = COALESCE($10, weekday_price_day),
           weekday_price_week = COALESCE($11, weekday_price_week),
           weekday_price_month = COALESCE($12, weekday_price_month),
           weekend_price_hour = COALESCE($13, weekend_price_hour),
           weekend_price_day = COALESCE($14, weekend_price_day),
           weekend_price_week = COALESCE($15, weekend_price_week),
           weekend_price_month = COALESCE($16, weekend_price_month),
           holiday_price_hour = COALESCE($17, holiday_price_hour),
           holiday_price_day = COALESCE($18, holiday_price_day),
           holiday_price_week = COALESCE($19, holiday_price_week),
           holiday_price_month = COALESCE($20, holiday_price_month),
           price = COALESCE($21, price),
           price_per_hour = COALESCE($22, price_per_hour),
           price_per_day = COALESCE($23, price_per_day),
           price_per_week = COALESCE($24, price_per_week),
           price_per_month = COALESCE($25, price_per_month),
           updated_at = now()
       WHERE id = $1
       RETURNING id, owner_id, name, description, status,
                 is_for_sale, is_for_rent, sale_price,
                 weekday_price_hour, weekday_price_day, weekday_price_week, weekday_price_month,
                 weekend_price_hour, weekend_price_day, weekend_price_week, weekend_price_month,
                 holiday_price_hour, holiday_price_day, holiday_price_week, holiday_price_month,
                 price, price_per_hour, price_per_day, price_per_week, price_per_month, created_at, updated_at;`,
      [
        itemId,
        isOwnerLikeRole(req) ? null : updates.ownerId != null ? String(updates.ownerId) : null,
        updates.name != null ? String(updates.name) : null,
        updates.description != null ? String(updates.description) : null,
        updates.status != null ? String(updates.status) : null,
        updates.isForSale,
        updates.isForRent,
        updates.salePrice,
        updates.weekdayPriceHour,
        updates.weekdayPriceDay,
        updates.weekdayPriceWeek,
        updates.weekdayPriceMonth,
        updates.weekendPriceHour,
        updates.weekendPriceDay,
        updates.weekendPriceWeek,
        updates.weekendPriceMonth,
        updates.holidayPriceHour,
        updates.holidayPriceDay,
        updates.holidayPriceWeek,
        updates.holidayPriceMonth,
        updates.price,
        updates.pricePerHour,
        updates.pricePerDay,
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

async function deleteItem(req, res) {
  try {
    const { itemId } = req.params;
    const scopedOwnerId = getScopedOwnerId(req);

    const existing = await pool.query(
      `SELECT id, owner_id
       FROM items
       WHERE id = $1
         AND ($2::uuid IS NULL OR owner_id = $2::uuid);`,
      [itemId, scopedOwnerId],
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM media
         WHERE target_type = 'item'
           AND target_id = $1;`,
        [itemId],
      );
      await client.query(
        `DELETE FROM items
         WHERE id = $1;`,
        [itemId],
      );
      await client.query("COMMIT");
      return res.json({ deleted: true, itemId });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err && err.code === "23503") {
      return res.status(409).json({ error: "Cannot delete item with related bookings" });
    }
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listItems,
  listCatalogItemGroups,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  getItemAvailability,
  getItemBookedSlots,
  getItemRentalPrice,
};

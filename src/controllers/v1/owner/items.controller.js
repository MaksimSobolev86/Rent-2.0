const { randomUUID } = require("crypto");

const pool = require("../../../db");
const { roundMoney } = require("../../../utils/money");
const { hasDealTypeColumn } = require("../../../utils/itemSchema");
const { ensureItemGroupsSchema } = require("../../../utils/ensureItemGroupsSchema");

const ITEM_SELECT_COLUMNS = `
  i.id, i.owner_id, i.name, i.description, i.status,
  i.is_for_sale, i.is_for_rent, i.sale_price,
  i.weekday_price_hour, i.weekday_price_day, i.weekday_price_week, i.weekday_price_month,
  i.weekend_price_hour, i.weekend_price_day, i.weekend_price_week, i.weekend_price_month,
  i.holiday_price_hour, i.holiday_price_day, i.holiday_price_week, i.holiday_price_month,
  i.price, i.price_per_hour, i.price_per_day, i.price_per_week, i.price_per_month,
  i.group_id, g.name AS group_name,
  i.created_at, i.updated_at`;

const ITEM_FROM_JOIN = `
  FROM items i
  LEFT JOIN item_groups g ON g.id = i.group_id AND g.owner_id = i.owner_id`;

function parseGroupIdFromBody(body) {
  if (
    !Object.prototype.hasOwnProperty.call(body, "groupId")
    && !Object.prototype.hasOwnProperty.call(body, "group_id")
  ) {
    return { provided: false, value: undefined };
  }
  const raw = body.groupId ?? body.group_id;
  if (raw === null || raw === "" || raw === "none") {
    return { provided: true, value: null };
  }
  const id = String(raw).trim();
  return { provided: true, value: id || null };
}

async function resolveOwnerGroupId(client, ownerId, groupId) {
  if (!groupId) return null;
  const result = await client.query(
    `SELECT id FROM item_groups WHERE id = $1 AND owner_id = $2;`,
    [groupId, ownerId],
  );
  if (result.rowCount === 0) {
    const err = new Error("Group not found");
    err.status = 400;
    throw err;
  }
  return groupId;
}

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

  const imageCount = parsed.filter((m) => m.type === "image").length;
  if (imageCount > 6) {
    return { media: null, error: "At most 6 images are allowed per item" };
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

function resolveDealFlags(body, fallback = {}) {
  const dealType = String(body.dealType ?? body.deal_type ?? "")
    .trim()
    .toLowerCase();
  let isForSale = parseBoolean(body.is_for_sale ?? body.isForSale, fallback.isForSale ?? false);
  let isForRent = parseBoolean(body.is_for_rent ?? body.isForRent, fallback.isForRent ?? false);

  if (dealType === "sale") {
    isForSale = true;
    isForRent = false;
  } else if (dealType === "rent") {
    isForRent = true;
    isForSale = false;
  }

  return { isForSale, isForRent };
}

function normalizeItemPricing(isForSale, isForRent, pricing) {
  const rentPrices = {
    weekdayPriceHour: pricing.weekdayPriceHour ?? null,
    weekdayPriceDay: pricing.weekdayPriceDay ?? null,
    weekdayPriceWeek: pricing.weekdayPriceWeek ?? null,
    weekdayPriceMonth: pricing.weekdayPriceMonth ?? null,
    weekendPriceHour: pricing.weekendPriceHour ?? null,
    weekendPriceDay: pricing.weekendPriceDay ?? null,
    weekendPriceWeek: pricing.weekendPriceWeek ?? null,
    weekendPriceMonth: pricing.weekendPriceMonth ?? null,
    holidayPriceHour: pricing.holidayPriceHour ?? null,
    holidayPriceDay: pricing.holidayPriceDay ?? null,
    holidayPriceWeek: pricing.holidayPriceWeek ?? null,
    holidayPriceMonth: pricing.holidayPriceMonth ?? null,
    pricePerHour: pricing.pricePerHour ?? null,
    pricePerDay: pricing.pricePerDay ?? null,
    pricePerWeek: pricing.pricePerWeek ?? null,
    pricePerMonth: pricing.pricePerMonth ?? null,
  };

  if (isForSale && !isForRent) {
    const salePrice = pricing.salePrice ?? null;
    return {
      isForSale: true,
      isForRent: false,
      salePrice,
      price: salePrice,
      ...Object.fromEntries(Object.keys(rentPrices).map((key) => [key, null])),
    };
  }

  if (isForRent && !isForSale) {
    return {
      isForSale: false,
      isForRent: true,
      salePrice: null,
      price: null,
      weekdayPriceHour: rentPrices.weekdayPriceHour,
      weekdayPriceDay: rentPrices.weekdayPriceDay,
      weekdayPriceWeek: rentPrices.weekdayPriceWeek,
      weekdayPriceMonth: rentPrices.weekdayPriceMonth,
      weekendPriceHour: rentPrices.weekendPriceHour,
      weekendPriceDay: rentPrices.weekendPriceDay,
      weekendPriceWeek: rentPrices.weekendPriceWeek,
      weekendPriceMonth: rentPrices.weekendPriceMonth,
      holidayPriceHour: rentPrices.holidayPriceHour,
      holidayPriceDay: rentPrices.holidayPriceDay,
      holidayPriceWeek: rentPrices.holidayPriceWeek,
      holidayPriceMonth: rentPrices.holidayPriceMonth,
      pricePerHour: null,
      pricePerDay: null,
      pricePerWeek: null,
      pricePerMonth: null,
    };
  }

  return {
    isForSale,
    isForRent,
    salePrice: pricing.salePrice ?? null,
    price: pricing.price ?? null,
    ...rentPrices,
  };
}

function mapItemRow(row, mediaMap = new Map()) {
  const isForSale = Boolean(row.is_for_sale);
  const isForRent = Boolean(row.is_for_rent);
  const hideRentPrices = isForSale && !isForRent;

  return {
    id: row.id,
    ownerId: row.owner_id,
    owner_id: row.owner_id,
    name: row.name,
    description: row.description ?? "",
    status: row.status ?? null,
    isForSale,
    isForRent,
    dealType: isForRent && !isForSale ? "rent" : "sale",
    salePrice: row.sale_price != null ? Number(row.sale_price) : null,
    weekdayPriceHour: hideRentPrices || row.weekday_price_hour == null ? null : Number(row.weekday_price_hour),
    weekdayPriceDay: hideRentPrices || row.weekday_price_day == null ? null : Number(row.weekday_price_day),
    weekdayPriceWeek: hideRentPrices || row.weekday_price_week == null ? null : Number(row.weekday_price_week),
    weekdayPriceMonth: hideRentPrices || row.weekday_price_month == null ? null : Number(row.weekday_price_month),
    weekendPriceHour: hideRentPrices || row.weekend_price_hour == null ? null : Number(row.weekend_price_hour),
    weekendPriceDay: hideRentPrices || row.weekend_price_day == null ? null : Number(row.weekend_price_day),
    weekendPriceWeek: hideRentPrices || row.weekend_price_week == null ? null : Number(row.weekend_price_week),
    weekendPriceMonth: hideRentPrices || row.weekend_price_month == null ? null : Number(row.weekend_price_month),
    holidayPriceHour: hideRentPrices || row.holiday_price_hour == null ? null : Number(row.holiday_price_hour),
    holidayPriceDay: hideRentPrices || row.holiday_price_day == null ? null : Number(row.holiday_price_day),
    holidayPriceWeek: hideRentPrices || row.holiday_price_week == null ? null : Number(row.holiday_price_week),
    holidayPriceMonth: hideRentPrices || row.holiday_price_month == null ? null : Number(row.holiday_price_month),
    price: row.price != null ? Number(row.price) : null,
    pricePerHour: null,
    pricePerDay: null,
    pricePerWeek: null,
    pricePerMonth: null,
    groupId: row.group_id ?? null,
    groupName: row.group_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    media: mediaMap.get(row.id) ?? [],
  };
}

async function createOwnerItem(req, res) {
  try {
    await ensureItemGroupsSchema();
    const ownerId = req.user.id;
    const b = req.body || {};
    const name = b.name ?? b.title;
    const description = b.description;
    const status = b.status;
    const mediaResult = parseItemMedia(b.media);
    if (mediaResult.error) {
      return res.status(400).json({ error: mediaResult.error });
    }
    const { isForSale, isForRent } = resolveDealFlags(b);
    const pricing = normalizeItemPricing(isForSale, isForRent, {
      salePrice: parseDecimal(b.sale_price ?? b.salePrice),
      weekdayPriceHour: parseDecimal(b.weekday_price_hour ?? b.weekdayPriceHour),
      weekdayPriceDay: parseDecimal(b.weekday_price_day ?? b.weekdayPriceDay),
      weekdayPriceWeek: parseDecimal(b.weekday_price_week ?? b.weekdayPriceWeek),
      weekdayPriceMonth: parseDecimal(b.weekday_price_month ?? b.weekdayPriceMonth),
      weekendPriceHour: parseDecimal(b.weekend_price_hour ?? b.weekendPriceHour),
      weekendPriceDay: parseDecimal(b.weekend_price_day ?? b.weekendPriceDay),
      weekendPriceWeek: parseDecimal(b.weekend_price_week ?? b.weekendPriceWeek),
      weekendPriceMonth: parseDecimal(b.weekend_price_month ?? b.weekendPriceMonth),
      holidayPriceHour: parseDecimal(b.holiday_price_hour ?? b.holidayPriceHour),
      holidayPriceDay: parseDecimal(b.holiday_price_day ?? b.holidayPriceDay),
      holidayPriceWeek: parseDecimal(b.holiday_price_week ?? b.holidayPriceWeek),
      holidayPriceMonth: parseDecimal(b.holiday_price_month ?? b.holidayPriceMonth),
      price: parseDecimal(b.price),
      pricePerHour: parseDecimal(b.price_per_hour ?? b.pricePerHour),
      pricePerDay: parseDecimal(b.price_per_day ?? b.pricePerDay),
      pricePerWeek: parseDecimal(b.price_per_week ?? b.pricePerWeek),
      pricePerMonth: parseDecimal(b.price_per_month ?? b.pricePerMonth),
    });
    const {
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
    } = pricing;

    if (name == null || String(name).trim() === "") {
      return res.status(400).json({ error: "name is required" });
    }
    if (
      Number.isNaN(price)
      || Number.isNaN(pricePerHour)
      || Number.isNaN(pricePerDay)
      || Number.isNaN(pricePerWeek)
      || Number.isNaN(pricePerMonth)
      || Number.isNaN(salePrice)
      || Number.isNaN(weekdayPriceHour) || Number.isNaN(weekdayPriceDay) || Number.isNaN(weekdayPriceWeek) || Number.isNaN(weekdayPriceMonth)
      || Number.isNaN(weekendPriceHour) || Number.isNaN(weekendPriceDay) || Number.isNaN(weekendPriceWeek) || Number.isNaN(weekendPriceMonth)
      || Number.isNaN(holidayPriceHour) || Number.isNaN(holidayPriceDay) || Number.isNaN(holidayPriceWeek) || Number.isNaN(holidayPriceMonth)
    ) {
      return res.status(400).json({ error: "price fields must be numbers" });
    }
    if (isForSale && salePrice == null) {
      return res.status(400).json({ error: "salePrice is required when isForSale is true" });
    }
    if (
      isForRent
      && [
        weekdayPriceHour, weekdayPriceDay, weekdayPriceWeek, weekdayPriceMonth,
        weekendPriceHour, weekendPriceDay, weekendPriceWeek, weekendPriceMonth,
        holidayPriceHour, holidayPriceDay, holidayPriceWeek, holidayPriceMonth,
      ].every((v) => v == null)
    ) {
      return res.status(400).json({ error: "At least one rent price is required when isForRent is true" });
    }

    const groupParsed = parseGroupIdFromBody(b);
    let groupId = null;
    if (groupParsed.provided && groupParsed.value) {
      groupId = groupParsed.value;
    }

    const id = randomUUID();
    const now = new Date();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (groupId) {
        await resolveOwnerGroupId(client, ownerId, groupId);
      }
      await client.query(
      `INSERT INTO items (
         id, owner_id, name, description, status, group_id,
         is_for_sale, is_for_rent, sale_price,
         weekday_price_hour, weekday_price_day, weekday_price_week, weekday_price_month,
         weekend_price_hour, weekend_price_day, weekend_price_week, weekend_price_month,
         holiday_price_hour, holiday_price_day, holiday_price_week, holiday_price_month,
         price, price_per_hour, price_per_day, price_per_week, price_per_month, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9,
         $10, $11, $12, $13,
         $14, $15, $16, $17,
         $18, $19, $20, $21,
         $22, $23, $24, $25, $26, $27, $28
       );`,
      [
        id,
        ownerId,
        String(name),
        description != null ? String(description) : "",
        status != null ? String(status) : null,
        groupId,
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
        now,
        now,
      ],
    );
      const result = await client.query(
        `SELECT ${ITEM_SELECT_COLUMNS} ${ITEM_FROM_JOIN} WHERE i.id = $1;`,
        [id],
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
    if (err?.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function updateOwnerItem(req, res) {
  try {
    await ensureItemGroupsSchema();
    const ownerId = req.user.id;
    const { itemId } = req.params;

    const existing = await pool.query(
      `SELECT id, owner_id, is_for_sale, is_for_rent, sale_price,
              weekday_price_hour, weekday_price_day, weekday_price_week, weekday_price_month,
              weekend_price_hour, weekend_price_day, weekend_price_week, weekend_price_month,
              holiday_price_hour, holiday_price_day, holiday_price_week, holiday_price_month,
              price, price_per_hour, price_per_day, price_per_week, price_per_month
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
    const current = existing.rows[0];
    const { isForSale, isForRent } = resolveDealFlags(b, {
      isForSale: Boolean(current.is_for_sale),
      isForRent: Boolean(current.is_for_rent),
    });
    const pickPricing = (camel, snake, currentValue) => {
      if (b[camel] !== undefined) return parseDecimal(b[camel]);
      if (b[snake] !== undefined) return parseDecimal(b[snake]);
      return currentValue != null ? roundMoney(Number(currentValue)) : null;
    };
    const pricing = normalizeItemPricing(isForSale, isForRent, {
      salePrice: pickPricing("salePrice", "sale_price", current.sale_price),
      weekdayPriceHour: pickPricing("weekdayPriceHour", "weekday_price_hour", current.weekday_price_hour),
      weekdayPriceDay: pickPricing("weekdayPriceDay", "weekday_price_day", current.weekday_price_day),
      weekdayPriceWeek: pickPricing("weekdayPriceWeek", "weekday_price_week", current.weekday_price_week),
      weekdayPriceMonth: pickPricing("weekdayPriceMonth", "weekday_price_month", current.weekday_price_month),
      weekendPriceHour: pickPricing("weekendPriceHour", "weekend_price_hour", current.weekend_price_hour),
      weekendPriceDay: pickPricing("weekendPriceDay", "weekend_price_day", current.weekend_price_day),
      weekendPriceWeek: pickPricing("weekendPriceWeek", "weekend_price_week", current.weekend_price_week),
      weekendPriceMonth: pickPricing("weekendPriceMonth", "weekend_price_month", current.weekend_price_month),
      holidayPriceHour: pickPricing("holidayPriceHour", "holiday_price_hour", current.holiday_price_hour),
      holidayPriceDay: pickPricing("holidayPriceDay", "holiday_price_day", current.holiday_price_day),
      holidayPriceWeek: pickPricing("holidayPriceWeek", "holiday_price_week", current.holiday_price_week),
      holidayPriceMonth: pickPricing("holidayPriceMonth", "holiday_price_month", current.holiday_price_month),
      price: pickPricing("price", "price", current.price),
      pricePerHour: pickPricing("pricePerHour", "price_per_hour", current.price_per_hour),
      pricePerDay: pickPricing("pricePerDay", "price_per_day", current.price_per_day),
      pricePerWeek: pickPricing("pricePerWeek", "price_per_week", current.price_per_week),
      pricePerMonth: pickPricing("pricePerMonth", "price_per_month", current.price_per_month),
    });
    const {
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
    } = pricing;

    if (
      Number.isNaN(price)
      || Number.isNaN(pricePerHour)
      || Number.isNaN(pricePerDay)
      || Number.isNaN(pricePerWeek)
      || Number.isNaN(pricePerMonth)
      || Number.isNaN(salePrice)
      || Number.isNaN(weekdayPriceHour) || Number.isNaN(weekdayPriceDay) || Number.isNaN(weekdayPriceWeek) || Number.isNaN(weekdayPriceMonth)
      || Number.isNaN(weekendPriceHour) || Number.isNaN(weekendPriceDay) || Number.isNaN(weekendPriceWeek) || Number.isNaN(weekendPriceMonth)
      || Number.isNaN(holidayPriceHour) || Number.isNaN(holidayPriceDay) || Number.isNaN(holidayPriceWeek) || Number.isNaN(holidayPriceMonth)
    ) {
      return res.status(400).json({ error: "price fields must be numbers" });
    }
    if (isForSale && salePrice == null) {
      return res.status(400).json({ error: "salePrice is required when isForSale is true" });
    }
    if (
      isForRent
      && [
        weekdayPriceHour, weekdayPriceDay, weekdayPriceWeek, weekdayPriceMonth,
        weekendPriceHour, weekendPriceDay, weekendPriceWeek, weekendPriceMonth,
        holidayPriceHour, holidayPriceDay, holidayPriceWeek, holidayPriceMonth,
      ].every((v) => v == null)
    ) {
      return res.status(400).json({ error: "At least one rent price is required when isForRent is true" });
    }

    const groupParsed = parseGroupIdFromBody(b);
    let groupIdToSet;
    if (groupParsed.provided) {
      groupIdToSet = groupParsed.value;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (groupParsed.provided && groupIdToSet) {
        await resolveOwnerGroupId(client, ownerId, groupIdToSet);
      }
      const updateParams = [
        itemId,
        name != null ? String(name) : null,
        description != null ? String(description) : null,
        status != null ? String(status) : null,
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
      ];
      let groupSql = "";
      if (groupParsed.provided) {
        groupSql = ", group_id = $25";
        updateParams.push(groupIdToSet);
      }
      await client.query(
      `UPDATE items
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           status = COALESCE($4, status),
           is_for_sale = $5,
           is_for_rent = $6,
           sale_price = $7,
           weekday_price_hour = $8,
           weekday_price_day = $9,
           weekday_price_week = $10,
           weekday_price_month = $11,
           weekend_price_hour = $12,
           weekend_price_day = $13,
           weekend_price_week = $14,
           weekend_price_month = $15,
           holiday_price_hour = $16,
           holiday_price_day = $17,
           holiday_price_week = $18,
           holiday_price_month = $19,
           price = $20,
           price_per_hour = $21,
           price_per_day = $22,
           price_per_week = $23,
           price_per_month = $24${groupSql},
           updated_at = now()
       WHERE id = $1;`,
      updateParams,
    );
      const updated = await client.query(
        `SELECT ${ITEM_SELECT_COLUMNS} ${ITEM_FROM_JOIN} WHERE i.id = $1;`,
        [itemId],
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
    if (err?.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function listOwnerItems(req, res) {
  try {
    await ensureItemGroupsSchema();
    const ownerId = req.user.id;
    const withDealType = await hasDealTypeColumn();
    const dealTypeSelect = withDealType ? ", i.deal_type" : "";
    const result = await pool.query(
      `SELECT ${ITEM_SELECT_COLUMNS}${dealTypeSelect}
       ${ITEM_FROM_JOIN}
       WHERE i.owner_id = $1
       ORDER BY g.name ASC NULLS LAST, i.created_at DESC;`,
      [ownerId],
    );

    const mediaMap = await fetchItemMediaMap(pool, ownerId, result.rows.map((r) => r.id));
    return res.json({ items: result.rows.map((r) => mapItemRow(r, mediaMap)) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function getOwnerItemById(req, res) {
  try {
    await ensureItemGroupsSchema();
    const ownerId = req.user.id;
    const { itemId } = req.params;
    const withDealType = await hasDealTypeColumn();
    const dealTypeSelect = withDealType ? ", i.deal_type" : "";
    const result = await pool.query(
      `SELECT ${ITEM_SELECT_COLUMNS}${dealTypeSelect}
       ${ITEM_FROM_JOIN}
       WHERE i.id = $1
         AND i.owner_id = $2;`,
      [itemId, ownerId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const mediaMap = await fetchItemMediaMap(pool, ownerId, [itemId]);
    return res.json({ item: mapItemRow(result.rows[0], mediaMap) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function deleteOwnerItem(req, res) {
  try {
    const ownerId = req.user.id;
    const { itemId } = req.params;

    const existing = await pool.query(
      `SELECT id
       FROM items
       WHERE id = $1
         AND owner_id = $2;`,
      [itemId, ownerId],
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM media
         WHERE owner_id = $1
           AND target_type = 'item'
           AND target_id = $2;`,
        [ownerId, itemId],
      );
      await client.query(
        `DELETE FROM items
         WHERE id = $1
           AND owner_id = $2;`,
        [itemId, ownerId],
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
       SET status = 'hidden', updated_at = now()
       WHERE id = $1;`,
      [itemId],
    );
    const updated = await pool.query(
      `SELECT ${ITEM_SELECT_COLUMNS} ${ITEM_FROM_JOIN} WHERE i.id = $1;`,
      [itemId],
    );

    const mediaMap = await fetchItemMediaMap(pool, ownerId, [itemId]);
    return res.json({ item: mapItemRow(updated.rows[0], mediaMap) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listOwnerItems,
  getOwnerItemById,
  createOwnerItem,
  updateOwnerItem,
  hideOwnerItem,
  deleteOwnerItem,
};

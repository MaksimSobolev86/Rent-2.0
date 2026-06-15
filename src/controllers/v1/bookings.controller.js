const { randomUUID } = require("crypto");

const pool = require("../../db");
const { resolveOwnerDayType, resolveRentalPrice } = require("../../utils/itemPricing");

const ITEM_RENT_PRICE_COLUMNS = `
              weekday_price_hour, weekday_price_day, weekday_price_week, weekday_price_month,
              weekend_price_hour, weekend_price_day, weekend_price_week, weekend_price_month,
              holiday_price_hour, holiday_price_day, holiday_price_week, holiday_price_month`;
const { getScopedOwnerId } = require("../../utils/ownerScope");
const { isItemAvailableForClients } = require("../../utils/itemCatalog");
const {
  computeDailyBookingSpan,
  ensureBookingsRentPeriodColumns,
} = require("../../utils/rentBookingPeriod");
const { addMoney, divideMoney, multiplyMoney, roundMoney } = require("../../utils/money");
const { ensureOwnerClientsTable } = require("../../utils/ensureAppSchema");

async function createBooking(req, res) {
  try {
    const ownerId = getScopedOwnerId(req);
    if (!ownerId) {
      return res.status(401).json({ error: "Owner authentication required" });
    }
    const b = req.body || {};
    const clientId = b.client_id ?? b.clientId;
    const itemId = b.item_id ?? b.itemId;
    const startRaw = b.start_at ?? b.startAt;
    const endRaw = b.end_at ?? b.endAt;
    const totalPriceRaw = b.total_price ?? b.totalPrice;

    if (!clientId) {
      return res.status(400).json({ error: "client_id is required" });
    }
    if (!itemId) return res.status(400).json({ error: "item_id is required" });
    if (!startRaw || !endRaw) {
      return res.status(400).json({ error: "start_at and end_at are required (ISO timestamps)" });
    }

    const startAt = new Date(startRaw);
    const endAt = new Date(endRaw);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return res.status(400).json({ error: "start_at and end_at must be valid dates" });
    }
    if (startAt >= endAt) {
      return res.status(400).json({ error: "start_at must be before end_at" });
    }

    let totalPrice = null;
    if (totalPriceRaw != null && totalPriceRaw !== "") {
      const n = Number(totalPriceRaw);
      if (!Number.isFinite(n)) {
        return res.status(400).json({ error: "total_price must be a number" });
      }
      totalPrice = roundMoney(n);
    }

    const clientCheck = await pool.query(
      `SELECT 1 FROM clients WHERE id = $1;`,
      [clientId],
    );
    if (clientCheck.rowCount === 0) {
      return res.status(400).json({ error: "Client not found" });
    }

    const itemCheck = await pool.query(
      `SELECT owner_id
       FROM items
       WHERE id = $1;`,
      [itemId],
    );
    if (itemCheck.rowCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }
    if (ownerId && itemCheck.rows[0].owner_id !== ownerId) {
      return res.status(403).json({ error: "Cannot create booking for foreign owner item" });
    }

    if (itemCheck.rows[0].owner_id) {
      await ensureOwnerClientsTable();
      await pool.query(
        `INSERT INTO owner_clients (owner_id, client_id)
         VALUES ($1, $2)
         ON CONFLICT (owner_id, client_id) DO NOTHING;`,
        [itemCheck.rows[0].owner_id, clientId],
      );
    }

    const conflict = await pool.query(
      `SELECT id
       FROM bookings
       WHERE item_id = $1
        AND type = 'rent'
        AND status IN ('pending', 'confirmed')
         AND NOT (end_at <= $2 OR start_at >= $3)
       LIMIT 1;`,
      [itemId, startAt, endAt],
    );

    if (conflict.rowCount > 0) {
      return res.status(409).json({
        error: "Dates conflict with existing booking",
        conflictBookingId: conflict.rows[0].id,
      });
    }

    const id = randomUUID();
    const status = "pending";
    const createdAt = new Date();

    const result = await pool.query(
      `INSERT INTO bookings (
         id, client_id, item_id, start_at, end_at, status, total_price, created_at, owner_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, client_id, item_id, start_at, end_at, status, total_price, created_at;`,
      [id, clientId, itemId, startAt, endAt, status, totalPrice, createdAt, itemCheck.rows[0].owner_id],
    );

    const row = result.rows[0];

    res.status(201).json({
      booking: {
        id: row.id,
        itemId: row.item_id,
        clientId: row.client_id,
        startAt: row.start_at,
        endAt: row.end_at,
        dateFrom: row.start_at.toISOString().slice(0, 10),
        dateTo: row.end_at.toISOString().slice(0, 10),
        status: row.status,
        totalPrice: row.total_price != null ? Number(row.total_price) : null,
        createdAt: row.created_at,
        cancelledBy: null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

function splitClientName(clientName) {
  const normalized = String(clientName || "").trim();
  if (!normalized) {
    return { firstName: "Гость", lastName: "VK" };
  }
  const [firstName = "Гость", ...rest] = normalized.split(/\s+/);
  return {
    firstName,
    lastName: rest.join(" ") || "VK",
  };
}

function daysBetweenInclusiveUTC(startAt, endAt) {
  const from = new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate()));
  const to = new Date(Date.UTC(endAt.getUTCFullYear(), endAt.getUTCMonth(), endAt.getUTCDate()));
  const days = Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(days, 1);
}

function extractOffsetMinutes(isoDateTimeRaw) {
  if (typeof isoDateTimeRaw !== "string") return 0;
  const trimmed = isoDateTimeRaw.trim();
  if (trimmed.endsWith("Z")) return 0;
  const match = trimmed.match(/([+-])(\d{2}):?(\d{2})$/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || "0");
  const minutes = Number(match[3] || "0");
  return sign * (hours * 60 + minutes);
}

function toDateKeyWithOffset(date, offsetMinutes) {
  return new Date(date.getTime() + offsetMinutes * 60 * 1000).toISOString().slice(0, 10);
}

async function ensureClientForRentBooking(client, { clientName, clientPhone, vkUserId }) {
  if (vkUserId != null) {
    const byVk = await client.query(
      `SELECT id
       FROM clients
       WHERE vk_user_id = $1
       LIMIT 1;`,
      [Number(vkUserId)],
    );
    if (byVk.rowCount > 0) return byVk.rows[0].id;
  }

  if (clientPhone) {
    const byPhone = await client.query(
      `SELECT id
       FROM clients
       WHERE phone = $1
       ORDER BY created_at DESC
       LIMIT 1;`,
      [String(clientPhone)],
    );
    if (byPhone.rowCount > 0) return byPhone.rows[0].id;
  }

  const { firstName, lastName } = splitClientName(clientName);
  const created = await client.query(
    `INSERT INTO clients (id, vk_user_id, first_name, last_name, phone, role, created_at)
     VALUES ($1, $2, $3, $4, $5, 'CLIENT', now())
     RETURNING id;`,
    [
      randomUUID(),
      vkUserId != null ? Number(vkUserId) : null,
      firstName,
      lastName,
      clientPhone ? String(clientPhone) : null,
    ],
  );
  return created.rows[0].id;
}

function getDailyRentPrice(item, dayType) {
  const directDay = resolveRentalPrice(item, dayType, "day");
  if (directDay != null) return directDay;

  const hourPrice = resolveRentalPrice(item, dayType, "hour");
  if (hourPrice != null) return multiplyMoney(hourPrice, 24);

  const weekPrice = resolveRentalPrice(item, dayType, "week");
  if (weekPrice != null) return divideMoney(weekPrice, 7);

  const monthPrice = resolveRentalPrice(item, dayType, "month");
  if (monthPrice != null) return divideMoney(monthPrice, 30);

  return null;
}

async function calculateRentTotalPrice(client, ownerId, item, startAt, endAt, offsetMinutes = 0) {
  const rentalDays = daysBetweenInclusiveUTC(startAt, endAt);
  let total = 0;

  for (let i = 0; i < rentalDays; i += 1) {
    const current = new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate() + i));
    const dateStr = toDateKeyWithOffset(current, offsetMinutes);
    const dayType = await resolveOwnerDayType(client, ownerId, dateStr);
    const dayPrice = getDailyRentPrice(item, dayType);
    if (dayPrice == null) {
      throw new Error("Rental price is not configured for selected period");
    }
    total = addMoney(total, dayPrice);
  }

  return roundMoney(total);
}

async function calculatePeriodAwareTotalPrice(client, ownerId, item, startAt, endAt, period, offsetMinutes = 0) {
  if (period === "hour") {
    let cursor = new Date(startAt);
    let total = 0;
    while (cursor < endAt) {
      const dateStr = toDateKeyWithOffset(cursor, offsetMinutes);
      const dayType = await resolveOwnerDayType(client, ownerId, dateStr);
      const hourPrice = resolveRentalPrice(item, dayType, "hour");
      if (hourPrice == null) {
        throw new Error("Hourly price is not configured for selected period");
      }
      total = addMoney(total, hourPrice);
      cursor = new Date(cursor.getTime() + 60 * 60 * 1000);
    }
    return roundMoney(total);
  }

  if (period === "day") {
    let cursor = new Date(
      Date.UTC(
        startAt.getUTCFullYear(),
        startAt.getUTCMonth(),
        startAt.getUTCDate(),
      ),
    );
    const endCursor = new Date(
      Date.UTC(
        endAt.getUTCFullYear(),
        endAt.getUTCMonth(),
        endAt.getUTCDate(),
      ),
    );
    let total = 0;

    while (cursor < endCursor) {
      const dateStr = toDateKeyWithOffset(cursor, offsetMinutes);
      const dayType = await resolveOwnerDayType(client, ownerId, dateStr);
      const dayPrice = resolveRentalPrice(item, dayType, "day");
      if (dayPrice == null) {
        throw new Error("Daily price is not configured for selected period");
      }
      total = addMoney(total, dayPrice);
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }

    return roundMoney(total);
  }

  // For week/month bookings we distribute period price by day
  // so weekend/holiday overrides are applied consistently.
  const divisor = period === "week" ? 7 : 30;
  let cursor = new Date(
    Date.UTC(
      startAt.getUTCFullYear(),
      startAt.getUTCMonth(),
      startAt.getUTCDate(),
    ),
  );
  const endCursor = new Date(
    Date.UTC(
      endAt.getUTCFullYear(),
      endAt.getUTCMonth(),
      endAt.getUTCDate(),
    ),
  );
  let total = 0;

  while (cursor < endCursor) {
    const dateStr = toDateKeyWithOffset(cursor, offsetMinutes);
    const dayType = await resolveOwnerDayType(client, ownerId, dateStr);
    const periodPrice = resolveRentalPrice(item, dayType, period);
    if (periodPrice == null) {
      throw new Error("Rental price is not configured for selected period");
    }
    total = addMoney(total, divideMoney(periodPrice, divisor));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return roundMoney(total);
}

async function createRentBooking(req, res) {
  const b = req.body || {};
  const itemId = b.itemId ?? b.item_id;
  const startRaw = b.startAt ?? b.start_at;
  const endRaw = b.endAt ?? b.end_at;
  const clientName = b.clientName ?? b.client_name;
  const clientPhone = b.clientPhone ?? b.client_phone;
  const clientComment = b.clientComment ?? b.client_comment;
  const vkUserId = b.vkUserId ?? b.vk_user_id;
  const periodRaw = b.period;
  const quantityRaw = b.quantity;
  const period = ["hour", "day", "week", "month"].includes(String(periodRaw || "").toLowerCase())
    ? String(periodRaw).toLowerCase()
    : null;
  const offsetMinutes = extractOffsetMinutes(String(startRaw ?? ""));

  if (!itemId) return res.status(400).json({ error: "itemId is required" });
  if (!startRaw || !endRaw) return res.status(400).json({ error: "startAt and endAt are required" });

  const startAt = new Date(startRaw);
  const endAt = new Date(endRaw);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return res.status(400).json({ error: "startAt and endAt must be valid ISO timestamps" });
  }
  if (endAt <= startAt) {
    return res.status(400).json({ error: "endAt must be greater than startAt" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureBookingsRentPeriodColumns(client);

    const itemRes = await client.query(
      `SELECT id, owner_id, status, is_for_rent,${ITEM_RENT_PRICE_COLUMNS}
       FROM items
       WHERE id = $1
       FOR UPDATE;`,
      [itemId],
    );
    if (itemRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "item_not_found", message: "Вещь не найдена" });
    }
    const item = itemRes.rows[0];
    if (!item.owner_id) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "owner_not_found", message: "У вещи не указан владелец" });
    }
    if (!isItemAvailableForClients(item.status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "item_unavailable",
        message: "Вещь недоступна: в каталоге только статус «Доступно»",
      });
    }
    if (!item.is_for_rent) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "item_not_rentable", message: "Вещь недоступна для аренды" });
    }

    const conflict = await client.query(
      `SELECT 1
       FROM bookings
       WHERE item_id = $1
         AND type = 'rent'
         AND status IN ('pending', 'confirmed')
         AND ($2 < end_at AND $3 > start_at)
       LIMIT 1;`,
      [itemId, startAt, endAt],
    );
    if (conflict.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "item_unavailable",
        message: "Вещь уже забронирована на выбранные даты",
      });
    }

    const clientId = await ensureClientForRentBooking(client, { clientName, clientPhone, vkUserId });
    await ensureOwnerClientsTable();
    await client.query(
      `INSERT INTO owner_clients (owner_id, client_id)
       VALUES ($1, $2)
       ON CONFLICT (owner_id, client_id) DO NOTHING;`,
      [item.owner_id, clientId],
    );

    let totalPrice;
    if (period) {
      totalPrice = await calculatePeriodAwareTotalPrice(
        client,
        item.owner_id,
        item,
        startAt,
        endAt,
        period,
        offsetMinutes,
      );
    } else {
      totalPrice = await calculateRentTotalPrice(
        client,
        item.owner_id,
        item,
        startAt,
        endAt,
        offsetMinutes,
      );
    }
    const bookingId = randomUUID();
    const dailySpan = period === "day"
      ? computeDailyBookingSpan(startAt, endAt, offsetMinutes)
      : null;

    const created = await client.query(
      `INSERT INTO bookings (
         id, client_id, item_id, start_at, end_at, status, total_price, created_at,
         type, rent_period, check_in_date, check_out_date, nights_count,
         client_name, client_phone, client_comment, owner_id, currency
       ) VALUES (
         $1, $2, $3, $4, $5, 'pending', $6, now(),
         'rent', $7, $8::date, $9::date, $10,
         $11, $12, $13, $14, 'RUB'
       )
       RETURNING id, client_id, item_id, owner_id, start_at, end_at, status, total_price,
                 type, rent_period, check_in_date, check_out_date, nights_count, currency, created_at;`,
      [
        bookingId,
        clientId,
        itemId,
        startAt,
        endAt,
        totalPrice,
        period,
        dailySpan?.checkInDate ?? null,
        dailySpan?.checkOutDate ?? null,
        dailySpan?.nightsCount ?? null,
        clientName ? String(clientName) : null,
        clientPhone ? String(clientPhone) : null,
        clientComment ? String(clientComment) : null,
        item.owner_id,
      ],
    );

    await client.query("COMMIT");
    const row = created.rows[0];
    return res.status(201).json({
      booking: {
        id: row.id,
        itemId: row.item_id,
        clientId: row.client_id,
        ownerId: row.owner_id,
        startAt: row.start_at,
        endAt: row.end_at,
        status: row.status,
        type: row.type,
        rentPeriod: row.rent_period ?? period ?? null,
        checkInDate: row.check_in_date ?? null,
        checkOutDate: row.check_out_date ?? null,
        nightsCount: row.nights_count != null ? Number(row.nights_count) : null,
        totalPrice: row.total_price != null ? Number(row.total_price) : null,
        currency: row.currency ?? "RUB",
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}

async function createSaleBooking(req, res) {
  const b = req.body || {};
  const itemId = b.itemId ?? b.item_id;
  const clientName = b.clientName ?? b.client_name;
  const clientPhone = b.clientPhone ?? b.client_phone;
  const clientComment = b.clientComment ?? b.client_comment;
  const vkUserId = b.vkUserId ?? b.vk_user_id;

  if (!itemId) return res.status(400).json({ error: "itemId is required" });
  if (!clientName || !String(clientName).trim()) {
    return res.status(400).json({ error: "clientName is required" });
  }
  if (!clientPhone || !String(clientPhone).trim()) {
    return res.status(400).json({ error: "clientPhone is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const itemRes = await client.query(
      `SELECT id, owner_id, status, is_for_sale, sale_price, price
       FROM items
       WHERE id = $1
       FOR UPDATE;`,
      [itemId],
    );
    if (itemRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "item_not_found", message: "Вещь не найдена" });
    }
    const item = itemRes.rows[0];
    if (!item.owner_id) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "owner_not_found", message: "У вещи не указан владелец" });
    }
    if (!isItemAvailableForClients(item.status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "item_unavailable",
        message: "Вещь недоступна: в каталоге только статус «Доступно»",
      });
    }
    if (!item.is_for_sale) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "item_not_for_sale", message: "Вещь недоступна для покупки" });
    }

    const salePrice =
      item.sale_price != null
        ? Number(item.sale_price)
        : item.price != null
          ? Number(item.price)
          : null;
    if (salePrice == null || !Number.isFinite(salePrice)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "sale_price_missing", message: "Не указана цена продажи" });
    }

    const existingSale = await client.query(
      `SELECT 1
       FROM bookings
       WHERE item_id = $1
         AND type = 'sale'
         AND status IN ('pending', 'confirmed')
       LIMIT 1;`,
      [itemId],
    );
    if (existingSale.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "item_already_sold",
        message: "Заявка на покупку этой вещи уже оформлена",
      });
    }

    const clientId = await ensureClientForRentBooking(client, { clientName, clientPhone, vkUserId });
    await ensureOwnerClientsTable();
    await client.query(
      `INSERT INTO owner_clients (owner_id, client_id)
       VALUES ($1, $2)
       ON CONFLICT (owner_id, client_id) DO NOTHING;`,
      [item.owner_id, clientId],
    );

    const now = new Date();
    const endAt = new Date(now.getTime() + 60 * 1000);
    const created = await client.query(
      `INSERT INTO bookings (
         id, client_id, item_id, start_at, end_at, status, total_price, created_at,
         type, client_name, client_phone, client_comment, owner_id, currency
       ) VALUES (
         $1, $2, $3, $4, $5, 'pending', $6, now(),
         'sale', $7, $8, $9, $10, 'RUB'
       )
       RETURNING id, client_id, item_id, owner_id, start_at, end_at, status, total_price, type, currency, created_at;`,
      [
        randomUUID(),
        clientId,
        itemId,
        now,
        endAt,
        salePrice,
        String(clientName).trim(),
        String(clientPhone).trim(),
        clientComment ? String(clientComment) : null,
        item.owner_id,
      ],
    );

    await client.query("COMMIT");
    const row = created.rows[0];
    return res.status(201).json({
      booking: {
        id: row.id,
        itemId: row.item_id,
        clientId: row.client_id,
        ownerId: row.owner_id,
        startAt: row.start_at,
        endAt: row.end_at,
        status: row.status,
        type: row.type,
        totalPrice: row.total_price != null ? Number(row.total_price) : null,
        currency: row.currency ?? "RUB",
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}

async function quoteRentBooking(req, res) {
  const b = req.body || {};
  const itemId = b.itemId ?? b.item_id;
  const startRaw = b.startAt ?? b.start_at;
  const endRaw = b.endAt ?? b.end_at;
  const periodRaw = b.period;
  const period = ["hour", "day", "week", "month"].includes(String(periodRaw || "").toLowerCase())
    ? String(periodRaw).toLowerCase()
    : null;
  const offsetMinutes = extractOffsetMinutes(String(startRaw ?? ""));

  if (!itemId) return res.status(400).json({ error: "itemId is required" });
  if (!startRaw || !endRaw) return res.status(400).json({ error: "startAt and endAt are required" });

  const startAt = new Date(startRaw);
  const endAt = new Date(endRaw);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return res.status(400).json({ error: "startAt and endAt must be valid ISO timestamps" });
  }
  if (endAt <= startAt) {
    return res.status(400).json({ error: "endAt must be greater than startAt" });
  }

  try {
    const itemRes = await pool.query(
      `SELECT id, owner_id,${ITEM_RENT_PRICE_COLUMNS},
              price_per_hour, price_per_day, price_per_week, price_per_month
       FROM items
       WHERE id = $1;`,
      [itemId],
    );
    if (itemRes.rowCount === 0) {
      return res.status(404).json({ error: "item_not_found", message: "Вещь не найдена" });
    }
    const item = itemRes.rows[0];
    if (!item.owner_id) {
      return res.status(400).json({ error: "owner_not_found", message: "У вещи не указан владелец" });
    }

    const totalPrice = period
      ? await calculatePeriodAwareTotalPrice(
        pool,
        item.owner_id,
        item,
        startAt,
        endAt,
        period,
        offsetMinutes,
      )
      : await calculateRentTotalPrice(pool, item.owner_id, item, startAt, endAt, offsetMinutes);

    return res.json({
      quote: {
        itemId,
        period: period ?? "custom",
        startAt,
        endAt,
        totalPrice,
        currency: "RUB",
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function cancelMyBooking(req, res) {
  try {
    const { bookingId } = req.params;
    const clientId = req.user?.id;
    if (!clientId) {
      return res
        .status(400)
        .json({ error: "Missing x-user-id (mock auth)" });
    }

    const bookingRes = await pool.query(
      `SELECT id, client_id, status
       FROM bookings
       WHERE id = $1;`,
      [bookingId],
    );
    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const booking = bookingRes.rows[0];
    if (booking.client_id !== clientId) {
      return res.status(403).json({ error: "Not your booking" });
    }

    if (booking.status === "cancelled") {
      return res.json({ bookingId: booking.id, status: booking.status });
    }

    const upd = await pool.query(
      `UPDATE bookings
       SET status = 'cancelled'
       WHERE id = $1
       RETURNING id, status;`,
      [bookingId],
    );

    return res.json({ bookingId: upd.rows[0].id, status: upd.rows[0].status });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function listBookings(req, res) {
  try {
    const ownerId = getScopedOwnerId(req);
    if (!ownerId) {
      return res.status(401).json({ error: "Owner authentication required" });
    }
    const result = await pool.query(
      `SELECT b.id, b.client_id, b.item_id, b.start_at, b.end_at, b.status, b.total_price, b.created_at
       FROM bookings b
       WHERE b.owner_id = $1::uuid
          OR (b.owner_id IS NULL AND EXISTS (
            SELECT 1 FROM items i WHERE i.id = b.item_id AND i.owner_id = $1::uuid
          ))
       ORDER BY b.created_at DESC;`,
      [ownerId],
    );

    const bookings = result.rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      itemId: r.item_id,
      startAt: r.start_at,
      endAt: r.end_at,
      dateFrom: r.start_at.toISOString().slice(0, 10),
      dateTo: r.end_at.toISOString().slice(0, 10),
      status: r.status,
      totalPrice: r.total_price != null ? Number(r.total_price) : null,
      createdAt: r.created_at,
    }));

    return res.json({ bookings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  createBooking,
  quoteRentBooking,
  createRentBooking,
  createSaleBooking,
  cancelMyBooking,
  listBookings,
};

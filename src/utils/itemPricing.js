function toNumericOrNull(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveRentalPrice(item, dayType, period) {
  const normalizedDay = (dayType || "weekday").toLowerCase();
  const normalizedPeriod = period.toLowerCase();
  const suffix = normalizedPeriod === "hour" ? "Hour" : normalizedPeriod === "week" ? "Week" : "Month";

  const weekdayPrice = toNumericOrNull(item[`weekdayPrice${suffix}`] ?? item[`weekday_price_${normalizedPeriod}`]);
  const dayPrice = toNumericOrNull(item[`${normalizedDay}Price${suffix}`] ?? item[`${normalizedDay}_price_${normalizedPeriod}`]);

  if (dayPrice != null) return dayPrice;
  if (weekdayPrice != null) return weekdayPrice;
  return null;
}

function parseDateOnly(input) {
  if (!input || typeof input !== "string") return null;
  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

async function resolveOwnerDayType(pool, ownerId, dateStr) {
  const date = parseDateOnly(dateStr);
  if (!date) {
    throw new Error("date must be YYYY-MM-DD");
  }
  const isoDate = date.toISOString().slice(0, 10);

  const holidayRes = await pool.query(
    `SELECT 1
     FROM owner_holidays
     WHERE owner_id = $1
       AND date = $2::date
     LIMIT 1;`,
    [ownerId, isoDate],
  );
  if (holidayRes.rowCount > 0) return "holiday";

  const weekday = date.getUTCDay(); // 0=Sunday ... 6=Saturday
  const weekendRes = await pool.query(
    `SELECT is_weekend
     FROM owner_weekday_rules
     WHERE owner_id = $1
       AND weekday = $2
     LIMIT 1;`,
    [ownerId, weekday],
  );
  if (weekendRes.rowCount > 0 && weekendRes.rows[0].is_weekend) {
    return "weekend";
  }
  return "weekday";
}

async function resolveOwnerRentalPrice(pool, ownerId, item, dateStr, period) {
  const dayType = await resolveOwnerDayType(pool, ownerId, dateStr);
  const price = resolveRentalPrice(item, dayType, period);
  return { dayType, price };
}

module.exports = { resolveRentalPrice, resolveOwnerDayType, resolveOwnerRentalPrice };

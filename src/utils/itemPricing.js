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

module.exports = { resolveRentalPrice };

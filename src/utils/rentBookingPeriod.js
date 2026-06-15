function toDateKeyWithOffset(date, offsetMinutes) {
  return new Date(date.getTime() + offsetMinutes * 60 * 1000).toISOString().slice(0, 10);
}

/** Даты заезда/выезда и число суток для rent_period = 'day'. */
function computeDailyBookingSpan(startAt, endAt, offsetMinutes = 0) {
  let cursor = new Date(
    Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate()),
  );
  const endCursor = new Date(
    Date.UTC(endAt.getUTCFullYear(), endAt.getUTCMonth(), endAt.getUTCDate()),
  );
  const checkInDate = toDateKeyWithOffset(cursor, offsetMinutes);
  let nightsCount = 0;

  while (cursor < endCursor) {
    nightsCount += 1;
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  if (nightsCount < 1) {
    nightsCount = 1;
  }

  let checkOutDate = toDateKeyWithOffset(endCursor, offsetMinutes);
  if (checkOutDate <= checkInDate) {
    const fallbackEnd = new Date(
      Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate() + nightsCount),
    );
    checkOutDate = toDateKeyWithOffset(fallbackEnd, offsetMinutes);
  }

  return {
    checkInDate,
    checkOutDate,
    nightsCount,
  };
}

async function ensureBookingsRentPeriodColumns(pool) {
  await pool.query(
    `ALTER TABLE bookings
       ADD COLUMN IF NOT EXISTS rent_period TEXT,
       ADD COLUMN IF NOT EXISTS check_in_date DATE,
       ADD COLUMN IF NOT EXISTS check_out_date DATE,
       ADD COLUMN IF NOT EXISTS nights_count INTEGER;`,
    [],
  );
}

module.exports = {
  computeDailyBookingSpan,
  ensureBookingsRentPeriodColumns,
};

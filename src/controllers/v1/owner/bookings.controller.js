const { parseISODateOnly, toTime } = require("../../../utils/dates");
const pool = require("../../../db");

async function hasEventParticipantsTable() {
  const result = await pool.query(
    "SELECT to_regclass('public.event_participants') IS NOT NULL AS exists;",
  );
  return Boolean(result.rows[0]?.exists);
}

function mapRentBookingRow(r) {
  return {
    clientFullName: (r.client_name && String(r.client_name).trim())
      ? r.client_name
      : [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || null,
    id: r.id,
    clientId: r.client_id,
    itemId: r.item_id,
    eventId: null,
    dateFrom: r.start_at.toISOString().slice(0, 10),
    dateTo: r.end_at.toISOString().slice(0, 10),
    startAt: r.start_at,
    endAt: r.end_at,
    status: r.status,
    type: r.type ?? "rent",
    itemName: r.item_name ?? null,
    clientName: (r.client_name && String(r.client_name).trim())
      ? r.client_name
      : [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || null,
    clientPhone: r.client_phone ?? r.client_phone_from_client ?? null,
    clientComment: r.client_comment ?? null,
    totalPrice: r.total_price != null ? Number(r.total_price) : null,
    currency: r.currency ?? "RUB",
    rentPeriod: r.rent_period ?? null,
    checkInDate: r.check_in_date ?? null,
    checkOutDate: r.check_out_date ?? null,
    nightsCount: r.nights_count != null ? Number(r.nights_count) : null,
    createdAt: r.created_at,
    cancelledBy: null,
  };
}

function mapEventRegistrationRow(r) {
  const clientName = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || null;
  return {
    clientFullName: clientName,
    id: r.id,
    clientId: r.client_id,
    itemId: null,
    eventId: r.event_id,
    dateFrom: r.starts_at.toISOString().slice(0, 10),
    dateTo: r.ends_at.toISOString().slice(0, 10),
    startAt: r.starts_at,
    endAt: r.ends_at,
    status: "registered",
    type: "event",
    itemName: r.event_title ? `Событие: ${r.event_title}` : "Событие",
    clientName,
    clientPhone: r.client_phone ?? null,
    clientComment: r.note ?? null,
    totalPrice: r.price != null ? Number(r.price) : null,
    currency: "RUB",
    createdAt: r.created_at,
    cancelledBy: null,
  };
}

async function listOwnerBookings(req, res) {
  try {
    const ownerId = req.user.id;
    const { status, itemId, item_id: itemIdAlt, dateFrom, dateTo } = req.query;
    const effectiveItemId = itemId ?? itemIdAlt ?? null;

    const qFrom = dateFrom ? parseISODateOnly(dateFrom) : null;
    const qTo = dateTo ? parseISODateOnly(dateTo) : null;

    if ((dateFrom && !qFrom) || (dateTo && !qTo)) {
      return res
        .status(400)
        .json({ error: "dateFrom/dateTo must be YYYY-MM-DD" });
    }

    if (qFrom && qTo && toTime(qFrom) >= toTime(qTo)) {
      return res.status(400).json({ error: "dateFrom must be < dateTo" });
    }

    const fromTs = qFrom ? new Date(toTime(qFrom)) : null;
    const toTs = qTo ? new Date(toTime(qTo)) : null;

    const result = await pool.query(
      `SELECT b.id, b.client_id, b.item_id, b.start_at, b.end_at,
              b.status, b.total_price, b.created_at, b.type, b.currency,
              b.rent_period, b.check_in_date, b.check_out_date, b.nights_count,
              b.client_name, b.client_phone, b.client_comment,
              c.first_name, c.last_name, c.phone AS client_phone_from_client,
              i.name AS item_name
       FROM bookings b
       LEFT JOIN items i ON i.id = b.item_id
       LEFT JOIN clients c ON c.id = b.client_id
       WHERE b.owner_id = $1
         AND ($2::text IS NULL OR b.status = $2::text)
         AND ($3::uuid IS NULL OR b.item_id = $3::uuid)
         AND (
           ($4::timestamp IS NULL AND $5::timestamp IS NULL)
           OR NOT (
             b.end_at <= COALESCE($4::timestamp, '-infinity')
             OR b.start_at >= COALESCE($5::timestamp, 'infinity')
           )
         )
       ORDER BY b.created_at DESC;`,
      [
        ownerId,
        status ?? null,
        effectiveItemId,
        fromTs,
        toTs,
      ],
    );

    const rentBookings = result.rows.map(mapRentBookingRow);

    let eventBookings = [];
    const includeEventRegistrations = !status || status === "registered";
    if (includeEventRegistrations && await hasEventParticipantsTable()) {
      const eventResult = await pool.query(
        `SELECT ep.id, ep.event_id, ep.client_id, ep.note, ep.created_at,
                e.title AS event_title, e.starts_at, e.ends_at, e.price,
                c.first_name, c.last_name, c.phone AS client_phone
         FROM event_participants ep
         INNER JOIN events e ON e.id = ep.event_id
         LEFT JOIN clients c ON c.id = ep.client_id
         WHERE e.owner_id = $1
           AND (
             ($2::timestamp IS NULL AND $3::timestamp IS NULL)
             OR NOT (
               e.ends_at <= COALESCE($2::timestamp, '-infinity')
               OR e.starts_at >= COALESCE($3::timestamp, 'infinity')
             )
           )
         ORDER BY ep.created_at DESC;`,
        [ownerId, fromTs, toTs],
      );
      eventBookings = eventResult.rows.map(mapEventRegistrationRow);
    }

    const bookings = [...rentBookings, ...eventBookings].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return res.json({ bookings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function confirmOwnerBooking(req, res) {
  try {
    const ownerId = req.user.id;
    const { bookingId } = req.params;

    const bookingRes = await pool.query(
      `SELECT b.id, b.status
       FROM bookings b
       WHERE b.id = $1 AND b.owner_id = $2;`,
      [bookingId, ownerId],
    );
    if (bookingRes.rowCount === 0) {
      const exists = await pool.query(`SELECT 1 FROM bookings WHERE id = $1;`, [
        bookingId,
      ]);
      if (exists.rowCount === 0) {
        return res.status(404).json({ error: "Booking not found" });
      }
      return res.status(403).json({ error: "Not your booking" });
    }

    if (bookingRes.rows[0].status === "cancelled") {
      return res.status(409).json({ error: "Booking already cancelled" });
    }

    const upd = await pool.query(
      `UPDATE bookings
       SET status = 'confirmed'
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

async function cancelOwnerBooking(req, res) {
  try {
    const ownerId = req.user.id;
    const { bookingId } = req.params;

    const bookingRes = await pool.query(
      `SELECT b.id, b.status
       FROM bookings b
       WHERE b.id = $1 AND b.owner_id = $2;`,
      [bookingId, ownerId],
    );
    if (bookingRes.rowCount === 0) {
      const exists = await pool.query(`SELECT 1 FROM bookings WHERE id = $1;`, [
        bookingId,
      ]);
      if (exists.rowCount === 0) {
        return res.status(404).json({ error: "Booking not found" });
      }
      return res.status(403).json({ error: "Not your booking" });
    }

    if (bookingRes.rows[0].status === "cancelled") {
      return res.json({ bookingId: bookingId, status: "cancelled" });
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

module.exports = { listOwnerBookings, confirmOwnerBooking, cancelOwnerBooking };

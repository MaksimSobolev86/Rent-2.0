const { parseISODateOnly, toTime } = require("../../../utils/dates");
const pool = require("../../../db");

async function listOwnerBookings(req, res) {
  try {
    const ownerId = req.user.id;
    const { status, itemId, dateFrom, dateTo } = req.query;

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
              b.status, b.total_price, b.created_at
       FROM bookings b
       JOIN items i ON i.id = b.item_id
       WHERE i.owner_id = $1
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
        itemId ?? null,
        fromTs,
        toTs,
      ],
    );

    const bookings = result.rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      itemId: r.item_id,
      dateFrom: r.start_at.toISOString().slice(0, 10),
      dateTo: r.end_at.toISOString().slice(0, 10),
      status: r.status,
      totalPrice: r.total_price != null ? Number(r.total_price) : null,
      createdAt: r.created_at,
      cancelledBy: null,
    }));

    return res.json({ bookings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function approveOwnerBooking(req, res) {
  try {
    const ownerId = req.user.id;
    const { bookingId } = req.params;

    const bookingRes = await pool.query(
      `SELECT b.id, b.status
       FROM bookings b
       JOIN items i ON i.id = b.item_id
       WHERE b.id = $1 AND i.owner_id = $2;`,
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
       SET status = 'approved'
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
       JOIN items i ON i.id = b.item_id
       WHERE b.id = $1 AND i.owner_id = $2;`,
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

module.exports = { listOwnerBookings, approveOwnerBooking, cancelOwnerBooking };

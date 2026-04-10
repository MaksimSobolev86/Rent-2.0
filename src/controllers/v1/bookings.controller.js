const { randomUUID } = require("crypto");

const { db } = require("../../models/db");
const { parseISODateOnly, toTime } = require("../../utils/dates");
const { overlaps } = require("../../utils/bookingOverlap");
const { query } = require("../../db");


async function createBooking(req, res) {
  try {
    const { itemId, dateFrom, dateTo } = req.body || {};

    const clientId = req.user?.id;
    if (!clientId) {
      return res
        .status(400)
        .json({ error: "Missing x-user-id (mock auth)" });
    }

    if (!itemId) return res.status(400).json({ error: "itemId is required" });

    const from = parseISODateOnly(dateFrom);
    const to = parseISODateOnly(dateTo);
    if (!from || !to) {
      return res
        .status(400)
        .json({ error: "dateFrom and dateTo must be YYYY-MM-DD" });
    }
    if (toTime(from) >= toTime(to)) {
      return res.status(400).json({ error: "dateFrom must be < dateTo" });
    }

    const item = db.items.find((i) => i.id === itemId);
    if (!item || item.isHidden) {
      return res.status(404).json({ error: "Item not found" });
    }

    const newFrom = toTime(from);
    const newTo = toTime(to);

    const conflict = db.bookings.find((b) => {
      if (b.itemId !== itemId) return false;
      if (b.status !== "pending" && b.status !== "approved") return false;
      return overlaps(toTime(b.dateFrom), toTime(b.dateTo), newFrom, newTo);
    });

    if (conflict) {
      return res.status(409).json({
        error: "Dates conflict with existing booking",
        conflictBookingId: conflict.id,
      });
    }

    const id = randomUUID();
    const status = "pending";
    const createdAt = new Date();

    // запись в PostgreSQL
    const result = await query(
      `INSERT INTO bookings (
         id, item_id, client_id, date_from, date_to, status, created_at, cancelled_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        itemId,
        clientId,
        dateFrom, // строка YYYY-MM-DD
        dateTo,
        status,
        createdAt,
        null,
      ]
    );

    const row = result.rows[0];

    res.status(201).json({
      booking: {
        id: row.id,
        itemId: row.item_id,
        clientId: row.client_id,
        dateFrom: row.date_from.toISOString().slice(0, 10),
        dateTo: row.date_to.toISOString().slice(0, 10),
        status: row.status,
        createdAt: row.created_at,
        cancelledBy: row.cancelled_by,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }

}
function cancelMyBooking(req, res) {
  const { bookingId } = req.params;
  const clientId = req.user?.id;
  if (!clientId) {
    return res
      .status(400)
      .json({ error: "Missing x-user-id (mock auth)" });
  }

  const booking = db.bookings.find((b) => b.id === bookingId);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.clientId !== clientId) {
    return res.status(403).json({ error: "Not your booking" });
  }

  if (booking.status === "cancelled") {
    return res.json({ bookingId: booking.id, status: booking.status });
  }

  booking.status = "cancelled";
  booking.cancelledBy = "client";

  return res.json({ bookingId: booking.id, status: booking.status });
}
module.exports = { createBooking, cancelMyBooking };


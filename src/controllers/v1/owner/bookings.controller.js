const { db } = require("../../../models/db");
const { parseISODateOnly, toTime } = require("../../../utils/dates");
const { overlaps } = require("../../../utils/bookingOverlap");

function listOwnerBookings(req, res) {
  const ownerId = req.user.id;

  const ownerItemIds = new Set(
    db.items.filter((i) => i.ownerId === ownerId).map((i) => i.id),
  );

  let bookings = db.bookings.filter((b) => ownerItemIds.has(b.itemId));

  const { status, itemId, dateFrom, dateTo } = req.query;

  if (status) {
    bookings = bookings.filter((b) => b.status === status);
  }

  if (itemId) {
    bookings = bookings.filter((b) => b.itemId === itemId);
  }

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

  if (qFrom || qTo) {
    const fromT = qFrom ? toTime(qFrom) : -Infinity;
    const toT = qTo ? toTime(qTo) : Infinity;

    bookings = bookings.filter((b) =>
      overlaps(toTime(b.dateFrom), toTime(b.dateTo), fromT, toT),
    );
  }

  const out = bookings.map((b) => ({
    ...b,
    dateFrom: b.dateFrom.toISOString().slice(0, 10),
    dateTo: b.dateTo.toISOString().slice(0, 10),
  }));

  return res.json({ bookings: out });
}

function approveOwnerBooking(req, res) {
  const ownerId = req.user.id;
  const { bookingId } = req.params;

  const booking = db.bookings.find((b) => b.id === bookingId);
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const item = db.items.find((i) => i.id === booking.itemId);
  if (!item || item.ownerId !== ownerId) {
    return res.status(403).json({ error: "Not your booking" });
  }

  if (booking.status === "cancelled") {
    return res.status(409).json({ error: "Booking already cancelled" });
  }

  booking.status = "approved";
  return res.json({ bookingId: booking.id, status: booking.status });
}

function cancelOwnerBooking(req, res) {
  const ownerId = req.user.id;
  const { bookingId } = req.params;

  const booking = db.bookings.find((b) => b.id === bookingId);
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const item = db.items.find((i) => i.id === booking.itemId);
  if (!item || item.ownerId !== ownerId) {
    return res.status(403).json({ error: "Not your booking" });
  }

  if (booking.status === "cancelled") {
    return res.json({ bookingId: booking.id, status: booking.status });
  }

  booking.status = "cancelled";
  booking.cancelledBy = "owner";
  return res.json({ bookingId: booking.id, status: booking.status });
}

module.exports = { listOwnerBookings, approveOwnerBooking, cancelOwnerBooking };


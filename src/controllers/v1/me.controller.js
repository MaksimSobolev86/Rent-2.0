const { db } = require("../../models/db");

function listMyBookings(req, res) {
  const clientId = req.user?.id;
  if (!clientId) {
    return res
      .status(400)
      .json({ error: "Missing x-user-id (mock auth)" });
  }

  const bookings = db.bookings
    .filter((b) => b.clientId === clientId)
    .map((b) => ({
      ...b,
      dateFrom: b.dateFrom.toISOString().slice(0, 10),
      dateTo: b.dateTo.toISOString().slice(0, 10),
    }));

  return res.json({ bookings });
}

module.exports = { listMyBookings };


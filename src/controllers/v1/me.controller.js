const pool = require("../../db");

async function listMyBookings(req, res) {
  try {
    const clientId = req.user?.id;
    if (!clientId) {
      return res
        .status(400)
        .json({ error: "Missing x-user-id (mock auth)" });
    }

    const result = await pool.query(
      `SELECT id, client_id, item_id, start_at, end_at, status, total_price, created_at
       FROM bookings
       WHERE client_id = $1
       ORDER BY created_at DESC;`,
      [clientId],
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
    }));

    return res.json({ bookings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { listMyBookings };

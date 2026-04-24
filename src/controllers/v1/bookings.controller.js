const { randomUUID } = require("crypto");

const pool = require("../../db");

async function ensureOwnerClientsTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS owner_clients (
       owner_id UUID NOT NULL REFERENCES owners(id),
       client_id UUID NOT NULL REFERENCES clients(id),
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       PRIMARY KEY (owner_id, client_id)
     );`,
    [],
  );
}

async function createBooking(req, res) {
  try {
    const ownerId = req.user?.role === "owner" ? req.user?.id : null;
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
      totalPrice = n;
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
         AND status IN ('pending', 'approved')
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
         id, client_id, item_id, start_at, end_at, status, total_price, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, client_id, item_id, start_at, end_at, status, total_price, created_at;`,
      [id, clientId, itemId, startAt, endAt, status, totalPrice, createdAt],
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
    const ownerId = req.user?.role === "owner" ? req.user?.id : null;
    const result = await pool.query(
      `SELECT b.id, b.client_id, b.item_id, b.start_at, b.end_at, b.status, b.total_price, b.created_at
       FROM bookings b
       JOIN items i ON i.id = b.item_id
       WHERE ($1::uuid IS NULL OR i.owner_id = $1::uuid)
       ORDER BY created_at DESC;`,
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

module.exports = { createBooking, cancelMyBooking, listBookings };

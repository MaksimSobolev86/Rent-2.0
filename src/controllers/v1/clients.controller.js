const { randomUUID } = require("crypto");

const pool = require("../../db");

async function ensureOwnerClientsTable() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS owner_clients (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       owner_id UUID NOT NULL REFERENCES owners(id),
       client_id UUID NOT NULL REFERENCES clients(id),
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       UNIQUE (owner_id, client_id)
     );`,
    [],
  );
}

async function ownerCanAccessClient(ownerId, clientId) {
  const access = await pool.query(
    `SELECT 1
     WHERE EXISTS (
       SELECT 1
       FROM owner_clients oc
       WHERE oc.owner_id = $1 AND oc.client_id = $2
     )
     OR EXISTS (
       SELECT 1
       FROM bookings b
       JOIN items i ON i.id = b.item_id
       WHERE b.client_id = $2 AND i.owner_id = $1
     );`,
    [ownerId, clientId],
  );
  return access.rowCount > 0;
}

async function createClient(req, res) {
  try {
    const ownerId = req.user?.role === "owner" ? req.user?.id : null;
    const b = req.body || {};
    const vkUserId = b.vk_user_id ?? b.vkUserId;
    const firstName = b.first_name ?? b.firstName;
    const lastName = b.last_name ?? b.lastName;
    const phone = b.phone;
    const photoUrl = b.photo_url ?? b.photoUrl;
    const role = b.role ?? "CLIENT";

    if (firstName == null || String(firstName).trim() === "") {
      return res.status(400).json({ error: "first_name is required" });
    }
    if (lastName == null || String(lastName).trim() === "") {
      return res.status(400).json({ error: "last_name is required" });
    }

    const id = randomUUID();
    const createdAt = new Date();

    const result = await pool.query(
      `INSERT INTO clients (
         id, vk_user_id, first_name, last_name, phone, photo_url, role, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, vk_user_id, first_name, last_name, phone, photo_url, role, created_at;`,
      [
        id,
        vkUserId != null ? Number(vkUserId) : null,
        String(firstName),
        String(lastName),
        phone != null ? String(phone) : null,
        photoUrl != null ? String(photoUrl) : null,
        String(role),
        createdAt,
      ],
    );

    const row = result.rows[0];

    if (ownerId) {
      await ensureOwnerClientsTable();
      await pool.query(
        `INSERT INTO owner_clients (owner_id, client_id)
         VALUES ($1, $2)
         ON CONFLICT (owner_id, client_id) DO NOTHING;`,
        [ownerId, row.id],
      );
    }

    return res.status(201).json({
      client: {
        id: row.id,
        vkUserId: row.vk_user_id,
        firstName: row.first_name,
        lastName: row.last_name,
        phone: row.phone,
        photoUrl: row.photo_url,
        role: row.role,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function listClients(req, res) {
  try {
    const ownerId = req.user?.role === "owner" ? req.user?.id : null;
    if (ownerId) {
      await ensureOwnerClientsTable();
    }
    const result = await pool.query(
      `SELECT c.id, c.vk_user_id, c.first_name, c.last_name, c.phone, c.photo_url, c.role, c.created_at,
              (
                SELECT COUNT(*)
                FROM bookings b2
                JOIN items i2 ON i2.id = b2.item_id
                WHERE b2.client_id = c.id
                  AND ($1::uuid IS NULL OR i2.owner_id = $1::uuid)
              )::int AS bookings_count,
              (
                SELECT COUNT(DISTINCT b3.item_id)
                FROM bookings b3
                JOIN items i3 ON i3.id = b3.item_id
                WHERE b3.client_id = c.id
                  AND ($1::uuid IS NULL OR i3.owner_id = $1::uuid)
              )::int AS items_count
       FROM clients c
       WHERE (
         $1::uuid IS NULL
         OR EXISTS (
           SELECT 1
           FROM owner_clients oc
           WHERE oc.owner_id = $1::uuid AND oc.client_id = c.id
         )
         OR EXISTS (
           SELECT 1
           FROM bookings b
           JOIN items i ON i.id = b.item_id
           WHERE b.client_id = c.id AND i.owner_id = $1::uuid
         )
       )
       ORDER BY c.created_at DESC;`,
      [ownerId],
    );

    const clients = result.rows.map((r) => ({
      id: r.id,
      vkUserId: r.vk_user_id,
      firstName: r.first_name,
      lastName: r.last_name,
      phone: r.phone,
      photoUrl: r.photo_url,
      role: r.role,
      createdAt: r.created_at,
      itemsCount: r.items_count ?? 0,
      bookingsCount: r.bookings_count ?? 0,
    }));

    return res.json({ clients });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function getClientById(req, res) {
  try {
    const { clientId } = req.params;
    const ownerId = req.user?.role === "owner" ? req.user?.id : null;
    if (ownerId) {
      await ensureOwnerClientsTable();
      const canAccess = await ownerCanAccessClient(ownerId, clientId);
      if (!canAccess) {
        return res.status(404).json({ error: "Client not found" });
      }
    }
    const result = await pool.query(
      `SELECT c.id, c.vk_user_id, c.first_name, c.last_name, c.phone, c.photo_url, c.role, c.created_at,
              (
                SELECT COUNT(*)
                FROM bookings b2
                JOIN items i2 ON i2.id = b2.item_id
                WHERE b2.client_id = c.id
                  AND ($2::uuid IS NULL OR i2.owner_id = $2::uuid)
              )::int AS bookings_count,
              (
                SELECT COUNT(DISTINCT b3.item_id)
                FROM bookings b3
                JOIN items i3 ON i3.id = b3.item_id
                WHERE b3.client_id = c.id
                  AND ($2::uuid IS NULL OR i3.owner_id = $2::uuid)
              )::int AS items_count
       FROM clients c
       WHERE c.id = $1
       GROUP BY c.id, c.vk_user_id, c.first_name, c.last_name, c.phone, c.photo_url, c.role, c.created_at;`,
      [clientId, ownerId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Client not found" });
    }

    const row = result.rows[0];
    return res.json({
      client: {
        id: row.id,
        vkUserId: row.vk_user_id,
        firstName: row.first_name,
        lastName: row.last_name,
        phone: row.phone,
        photoUrl: row.photo_url,
        role: row.role,
        createdAt: row.created_at,
        itemsCount: row.items_count ?? 0,
        bookingsCount: row.bookings_count ?? 0,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function listClientItems(req, res) {
  try {
    const { clientId } = req.params;
    const ownerId = req.user?.role === "owner" ? req.user?.id : null;
    const result = await pool.query(
      `SELECT DISTINCT i.id, i.owner_id, i.name, i.description, i.status,
              i.photo_url, i.video_url,
              i.is_for_sale, i.is_for_rent, i.sale_price,
              i.weekday_price_hour, i.weekday_price_week, i.weekday_price_month,
              i.weekend_price_hour, i.weekend_price_week, i.weekend_price_month,
              i.holiday_price_hour, i.holiday_price_week, i.holiday_price_month,
              i.price, i.price_per_hour, i.price_per_week, i.price_per_month,
              i.created_at, i.updated_at
       FROM items i
       JOIN bookings b ON b.item_id = i.id
       WHERE b.client_id = $1
         AND ($2::uuid IS NULL OR i.owner_id = $2::uuid)
       ORDER BY i.created_at DESC;`,
      [clientId, ownerId],
    );

    const items = result.rows.map((r) => ({
      id: r.id,
      ownerId: r.owner_id,
      owner_id: r.owner_id,
      name: r.name,
      description: r.description ?? "",
      status: r.status ?? null,
      photoUrl: r.photo_url ?? null,
      photo_url: r.photo_url ?? null,
      videoUrl: r.video_url ?? null,
      video_url: r.video_url ?? null,
      isForSale: Boolean(r.is_for_sale),
      is_for_sale: Boolean(r.is_for_sale),
      isForRent: Boolean(r.is_for_rent),
      is_for_rent: Boolean(r.is_for_rent),
      salePrice: r.sale_price != null ? Number(r.sale_price) : null,
      sale_price: r.sale_price != null ? Number(r.sale_price) : null,
      weekdayPriceHour: r.weekday_price_hour != null ? Number(r.weekday_price_hour) : null,
      weekday_price_hour: r.weekday_price_hour != null ? Number(r.weekday_price_hour) : null,
      weekdayPriceWeek: r.weekday_price_week != null ? Number(r.weekday_price_week) : null,
      weekday_price_week: r.weekday_price_week != null ? Number(r.weekday_price_week) : null,
      weekdayPriceMonth: r.weekday_price_month != null ? Number(r.weekday_price_month) : null,
      weekday_price_month: r.weekday_price_month != null ? Number(r.weekday_price_month) : null,
      weekendPriceHour: r.weekend_price_hour != null ? Number(r.weekend_price_hour) : null,
      weekend_price_hour: r.weekend_price_hour != null ? Number(r.weekend_price_hour) : null,
      weekendPriceWeek: r.weekend_price_week != null ? Number(r.weekend_price_week) : null,
      weekend_price_week: r.weekend_price_week != null ? Number(r.weekend_price_week) : null,
      weekendPriceMonth: r.weekend_price_month != null ? Number(r.weekend_price_month) : null,
      weekend_price_month: r.weekend_price_month != null ? Number(r.weekend_price_month) : null,
      holidayPriceHour: r.holiday_price_hour != null ? Number(r.holiday_price_hour) : null,
      holiday_price_hour: r.holiday_price_hour != null ? Number(r.holiday_price_hour) : null,
      holidayPriceWeek: r.holiday_price_week != null ? Number(r.holiday_price_week) : null,
      holiday_price_week: r.holiday_price_week != null ? Number(r.holiday_price_week) : null,
      holidayPriceMonth: r.holiday_price_month != null ? Number(r.holiday_price_month) : null,
      holiday_price_month: r.holiday_price_month != null ? Number(r.holiday_price_month) : null,
      price: r.price != null ? Number(r.price) : null,
      pricePerHour: r.price_per_hour != null ? Number(r.price_per_hour) : null,
      price_per_hour: r.price_per_hour != null ? Number(r.price_per_hour) : null,
      pricePerWeek: r.price_per_week != null ? Number(r.price_per_week) : null,
      price_per_week: r.price_per_week != null ? Number(r.price_per_week) : null,
      pricePerMonth: r.price_per_month != null ? Number(r.price_per_month) : null,
      price_per_month: r.price_per_month != null ? Number(r.price_per_month) : null,
      createdAt: r.created_at,
      created_at: r.created_at,
      updatedAt: r.updated_at,
      updated_at: r.updated_at,
    }));

    return res.json({ items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function listClientBookings(req, res) {
  try {
    const { clientId } = req.params;
    const ownerId = req.user?.role === "owner" ? req.user?.id : null;
    const result = await pool.query(
      `SELECT b.id, b.client_id, b.item_id, b.start_at, b.end_at, b.status, b.total_price, b.created_at
       FROM bookings b
       JOIN items i ON i.id = b.item_id
       WHERE b.client_id = $1
         AND ($2::uuid IS NULL OR i.owner_id = $2::uuid)
       ORDER BY created_at DESC;`,
      [clientId, ownerId],
    );

    const bookings = result.rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      itemId: r.item_id,
      startDate: r.start_at.toISOString().slice(0, 10),
      start_date: r.start_at.toISOString().slice(0, 10),
      endDate: r.end_at.toISOString().slice(0, 10),
      end_date: r.end_at.toISOString().slice(0, 10),
      status: r.status,
      totalPrice: r.total_price != null ? Number(r.total_price) : null,
      total_price: r.total_price != null ? Number(r.total_price) : null,
      createdAt: r.created_at,
      created_at: r.created_at,
    }));

    return res.json({ bookings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function updateClient(req, res) {
  try {
    const { clientId } = req.params;
    const b = req.body || {};
    const ownerId = req.user?.role === "owner" ? req.user?.id : null;
    if (ownerId) {
      await ensureOwnerClientsTable();
      const canAccess = await ownerCanAccessClient(ownerId, clientId);
      if (!canAccess) {
        return res.status(404).json({ error: "Client not found" });
      }
    }

    const existing = await pool.query(
      `SELECT id, first_name, last_name, phone
       FROM clients
       WHERE id = $1;`,
      [clientId],
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Client not found" });
    }

    const firstName = b.first_name ?? b.firstName ?? existing.rows[0].first_name;
    const lastName = b.last_name ?? b.lastName ?? existing.rows[0].last_name;
    const phone = b.phone ?? existing.rows[0].phone;

    if (firstName == null || String(firstName).trim() === "") {
      return res.status(400).json({ error: "first_name is required" });
    }
    if (lastName == null || String(lastName).trim() === "") {
      return res.status(400).json({ error: "last_name is required" });
    }

    const result = await pool.query(
      `UPDATE clients
       SET first_name = $2,
           last_name = $3,
           phone = $4
       WHERE id = $1
       RETURNING id, vk_user_id, first_name, last_name, phone, photo_url, role, created_at;`,
      [
        clientId,
        String(firstName),
        String(lastName),
        phone != null ? String(phone) : null,
      ],
    );

    const row = result.rows[0];
    return res.json({
      client: {
        id: row.id,
        vkUserId: row.vk_user_id,
        firstName: row.first_name,
        lastName: row.last_name,
        phone: row.phone,
        photoUrl: row.photo_url,
        role: row.role,
        createdAt: row.created_at,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function deleteClient(req, res) {
  try {
    const { clientId } = req.params;
    const ownerId = req.user?.role === "owner" ? req.user?.id : null;
    if (ownerId) {
      await ensureOwnerClientsTable();
      const canAccess = await ownerCanAccessClient(ownerId, clientId);
      if (!canAccess) {
        return res.status(404).json({ error: "Client not found" });
      }
    }

    const existing = await pool.query(
      `SELECT id
       FROM clients
       WHERE id = $1;`,
      [clientId],
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Client not found" });
    }

    const [itemsCountResult, bookingsCountResult] = await Promise.all([
      ownerId
        ? pool.query(
          `SELECT COUNT(*)::int AS count
           FROM items
           WHERE owner_id = $1
             AND id IN (
               SELECT item_id
               FROM bookings
               WHERE client_id = $2
             );`,
          [ownerId, clientId],
        )
        : pool.query(
          `SELECT COUNT(*)::int AS count
           FROM items
           WHERE id IN (
             SELECT item_id
             FROM bookings
             WHERE client_id = $1
           );`,
          [clientId],
        ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM bookings
         WHERE client_id = $1;`,
        [clientId],
      ),
    ]);

    const itemsCount = itemsCountResult.rows[0]?.count ?? 0;
    const bookingsCount = bookingsCountResult.rows[0]?.count ?? 0;

    if (itemsCount > 0 || bookingsCount > 0) {
      return res.status(409).json({
        error: "Cannot delete client with related items or bookings",
        itemsCount,
        bookingsCount,
      });
    }

    await pool.query(
      `DELETE FROM clients
       WHERE id = $1;`,
      [clientId],
    );

    if (ownerId) {
      await pool.query(
        `DELETE FROM owner_clients
         WHERE owner_id = $1 AND client_id = $2;`,
        [ownerId, clientId],
      );
    }

    return res.json({ deleted: true, clientId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  createClient,
  listClients,
  getClientById,
  listClientItems,
  listClientBookings,
  updateClient,
  deleteClient,
};

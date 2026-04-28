const pool = require("../../db");

async function getEventById(req, res) {
  try {
    const { eventId } = req.params;
    const eventRes = await pool.query(
      `SELECT id, owner_id, title, description, location,
              starts_at, ends_at, capacity, min_participants,
              registration_deadline, price,
              group_discount_min_participants, group_discount_percent,
              is_private, age_restriction, notes_for_clients,
              status, created_at, updated_at
       FROM events
       WHERE id = $1;`,
      [eventId],
    );
    if (eventRes.rowCount === 0) {
      return res.status(404).json({ error: "Event not found" });
    }

    const row = eventRes.rows[0];
    const mediaRes = await pool.query(
      `SELECT id, url, type, sort_order
       FROM media
       WHERE target_type = 'event'
         AND target_id = $1
       ORDER BY sort_order ASC, created_at ASC;`,
      [eventId],
    );

    const event = {
      id: row.id,
      ownerId: row.owner_id,
      title: row.title,
      description: row.description,
      location: row.location,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      capacity: row.capacity != null ? Number(row.capacity) : null,
      minParticipants: row.min_participants != null ? Number(row.min_participants) : null,
      registrationDeadline: row.registration_deadline,
      price: row.price != null ? Number(row.price) : null,
      groupDiscountMinParticipants: row.group_discount_min_participants != null
        ? Number(row.group_discount_min_participants)
        : null,
      groupDiscountPercent: row.group_discount_percent != null ? Number(row.group_discount_percent) : null,
      isPrivate: Boolean(row.is_private),
      ageRestriction: row.age_restriction,
      notesForClients: row.notes_for_clients,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      media: mediaRes.rows.map((m) => ({
        id: m.id,
        url: m.url,
        type: m.type,
        sortOrder: m.sort_order,
      })),
    };

    return res.json({ event });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getEventById };

const pool = require("../../db");
const { randomUUID } = require("crypto");
const { EventStatus } = require("../../constants/event-status");
const { resolveCatalogOwnerId } = require("../../utils/ownerScope");
const {
  ensureEventParticipantsTable,
  ensureOwnerClientsTable,
} = require("../../utils/ensureAppSchema");

async function markPublishedEventsAsCompleted() {
  await pool.query(
    `UPDATE events
     SET status = $1, updated_at = now()
     WHERE status = $2
       AND ends_at < now()
       AND updated_at <= ends_at;`,
    [EventStatus.Completed, EventStatus.Published],
  );
}

function splitClientName(clientName) {
  const normalized = String(clientName || "").trim();
  if (!normalized) {
    return { firstName: "Гость", lastName: "VK" };
  }
  const [firstName = "Гость", ...rest] = normalized.split(/\s+/);
  return {
    firstName,
    lastName: rest.join(" ") || "VK",
  };
}

async function ensureClientForEventRegistration(client, { clientName, clientPhone, vkUserId }) {
  if (vkUserId != null && vkUserId !== "") {
    const byVk = await client.query(
      `SELECT id
       FROM clients
       WHERE vk_user_id = $1
       LIMIT 1;`,
      [Number(vkUserId)],
    );
    if (byVk.rowCount > 0) return byVk.rows[0].id;
  }

  if (clientPhone) {
    const byPhone = await client.query(
      `SELECT id
       FROM clients
       WHERE phone = $1
       ORDER BY created_at DESC
       LIMIT 1;`,
      [String(clientPhone)],
    );
    if (byPhone.rowCount > 0) return byPhone.rows[0].id;
  }

  const { firstName, lastName } = splitClientName(clientName);
  const created = await client.query(
    `INSERT INTO clients (id, vk_user_id, first_name, last_name, phone, role, created_at)
     VALUES ($1, $2, $3, $4, $5, 'CLIENT', now())
     RETURNING id;`,
    [
      randomUUID(),
      vkUserId != null && vkUserId !== "" ? Number(vkUserId) : null,
      firstName,
      lastName,
      clientPhone ? String(clientPhone) : null,
    ],
  );
  return created.rows[0].id;
}

function buildDerivedFlags(row) {
  const now = new Date();
  const isFinished = row.ends_at < now;
  const capacity = row.capacity != null ? Number(row.capacity) : null;
  const currentParticipants = Number(row.current_participants ?? 0);
  const isFull = capacity == null ? false : currentParticipants >= capacity;
  const registrationDeadline = row.registration_deadline ? new Date(row.registration_deadline) : null;
  const isRegistrationClosed = row.status !== EventStatus.Published
    || (registrationDeadline && now > registrationDeadline)
    || now > row.starts_at;

  return { isFinished, isFull, isRegistrationClosed };
}

async function fetchEventsMediaMap(eventIds) {
  if (!eventIds.length) return new Map();
  const mediaRes = await pool.query(
    `SELECT id, target_id, url, type, sort_order
     FROM media
     WHERE target_type = 'event'
       AND target_id = ANY($1::uuid[])
     ORDER BY target_id, sort_order ASC, created_at ASC;`,
    [eventIds],
  );
  const map = new Map();
  mediaRes.rows.forEach((row) => {
    if (!map.has(row.target_id)) map.set(row.target_id, []);
    map.get(row.target_id).push({
      id: row.id,
      url: row.url,
      type: row.type,
      sortOrder: row.sort_order,
    });
  });
  return map;
}

function mapEventRow(row, mediaMap = new Map()) {
  return {
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
    media: mediaMap.get(row.id) ?? [],
    ...buildDerivedFlags(row),
  };
}

async function listEvents(req, res) {
  try {
    const ownerId = resolveCatalogOwnerId(req);
    if (!ownerId) {
      return res.status(400).json({ error: "ownerId query parameter is required" });
    }
    // Lazy status synchronization: past published events become completed.
    await markPublishedEventsAsCompleted();
    const result = await pool.query(
      `SELECT e.id, e.owner_id, e.title, e.description, e.location,
              e.starts_at, e.ends_at, e.capacity, e.min_participants,
              e.registration_deadline, e.price,
              e.group_discount_min_participants, e.group_discount_percent,
              e.is_private, e.age_restriction, e.notes_for_clients,
              e.status, e.created_at, e.updated_at,
              0::int AS current_participants
       FROM events e
       WHERE ($1::uuid IS NULL OR e.owner_id = $1::uuid)
        AND e.status = $2
       ORDER BY e.starts_at ASC;`,
      [ownerId, EventStatus.Published],
    );
    const mediaMap = await fetchEventsMediaMap(result.rows.map((row) => row.id));
    return res.json({ events: result.rows.map((row) => mapEventRow(row, mediaMap)) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function getEventById(req, res) {
  try {
    const { eventId } = req.params;
    // Lazy status synchronization: past published events become completed.
    await markPublishedEventsAsCompleted();
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

async function registerForEvent(req, res) {
  const { eventId } = req.params;
  const body = req.body || {};
  const clientName = String(body.clientName ?? body.client_name ?? "").trim();
  const clientPhone = String(body.clientPhone ?? body.client_phone ?? "").trim();
  const clientComment = String(body.clientComment ?? body.client_comment ?? "").trim();
  const vkUserId = body.vkUserId ?? body.vk_user_id;

  if (!clientName) {
    return res.status(400).json({ error: "clientName is required" });
  }
  if (!clientPhone) {
    return res.status(400).json({ error: "clientPhone is required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureEventParticipantsTable();
    await markPublishedEventsAsCompleted();

    const eventRes = await client.query(
      `SELECT id, owner_id, status, starts_at, registration_deadline, capacity
       FROM events
       WHERE id = $1
       FOR UPDATE;`,
      [eventId],
    );
    if (eventRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Event not found" });
    }

    const event = eventRes.rows[0];
    const now = new Date();
    if (event.status !== EventStatus.Published) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Event registration is closed" });
    }
    if (new Date(event.starts_at) <= now) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Event has already started" });
    }
    if (event.registration_deadline && new Date(event.registration_deadline) <= now) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Registration deadline has passed" });
    }

    if (event.capacity != null) {
      const participantsRes = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM event_participants
         WHERE event_id = $1;`,
        [eventId],
      );
      const participantsCount = Number(participantsRes.rows[0]?.count ?? 0);
      if (participantsCount >= Number(event.capacity)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Event is full" });
      }
    }

    const clientId = await ensureClientForEventRegistration(client, {
      clientName,
      clientPhone,
      vkUserId,
    });

    const inserted = await client.query(
      `INSERT INTO event_participants (event_id, client_id, note)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id, client_id) DO UPDATE
       SET note = EXCLUDED.note
       RETURNING id, event_id, client_id, note, created_at;`,
      [eventId, clientId, clientComment || null],
    );

    await ensureOwnerClientsTable(client);
    await client.query(
      `INSERT INTO owner_clients (owner_id, client_id)
       VALUES ($1, $2)
       ON CONFLICT (owner_id, client_id) DO NOTHING;`,
      [event.owner_id, clientId],
    );

    await client.query("COMMIT");
    return res.status(201).json({
      participant: {
        id: inserted.rows[0].id,
        eventId: inserted.rows[0].event_id,
        clientId: inserted.rows[0].client_id,
        note: inserted.rows[0].note,
        createdAt: inserted.rows[0].created_at,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}

module.exports = { listEvents, getEventById, registerForEvent };

const pool = require("../../../db");

const EVENT_STATUSES = new Set(["draft", "published", "cancelled"]);
const INVALID_DATE = Symbol("invalid-date");
let hasEventParticipantsTableCache = null;

function parseEventMedia(rawMedia) {
  if (rawMedia == null) return { media: null, error: null };
  if (!Array.isArray(rawMedia)) return { media: null, error: "media must be an array" };

  const parsed = [];
  for (let i = 0; i < rawMedia.length; i += 1) {
    const media = rawMedia[i] || {};
    const url = typeof media.url === "string" ? media.url.trim() : "";
    const type = typeof media.type === "string" ? media.type.trim().toLowerCase() : "";
    const sortOrderRaw = media.sortOrder ?? media.sort_order ?? 0;
    const sortOrder = Number(sortOrderRaw);

    if (!url) return { media: null, error: `media[${i}].url is required` };
    if (!["image", "video"].includes(type)) {
      return { media: null, error: `media[${i}].type must be image or video` };
    }
    if (!Number.isInteger(sortOrder)) {
      return { media: null, error: `media[${i}].sortOrder must be an integer` };
    }
    parsed.push({ url, type, sortOrder });
  }
  return { media: parsed, error: null };
}

async function replaceEventMedia(client, ownerId, eventId, media) {
  await client.query(
    `DELETE FROM media
     WHERE owner_id = $1
       AND target_type = 'event'
       AND target_id = $2;`,
    [ownerId, eventId],
  );
  if (!media || media.length === 0) return;

  const values = [];
  const placeholders = [];
  media.forEach((m, index) => {
    const base = index * 5;
    placeholders.push(`($${base + 1}, $${base + 2}, 'event', $${base + 3}, $${base + 4}, $${base + 5})`);
    values.push(ownerId, eventId, m.url, m.type, m.sortOrder);
  });

  await client.query(
    `INSERT INTO media (owner_id, target_id, target_type, url, type, sort_order)
     VALUES ${placeholders.join(", ")};`,
    values,
  );
}

async function fetchEventMediaMap(client, ownerId, eventIds) {
  if (!eventIds.length) return new Map();
  const mediaRes = await client.query(
    `SELECT id, target_id, url, type, sort_order
     FROM media
     WHERE owner_id = $1
       AND target_type = 'event'
       AND target_id = ANY($2::uuid[])
     ORDER BY target_id, sort_order ASC, created_at ASC;`,
    [ownerId, eventIds],
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

function getOwnerId(req) {
  return req.user?.ownerId ?? req.user?.id ?? null;
}

function parseOptionalNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseOptionalDate(value) {
  if (value == null || value === "") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? INVALID_DATE : parsed;
}

function parseOptionalBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeEventPayload(body) {
  return {
    title: body.title,
    description: body.description,
    location: body.location,
    startsAt: parseOptionalDate(body.startsAt ?? body.starts_at),
    endsAt: parseOptionalDate(body.endsAt ?? body.ends_at),
    capacity: parseOptionalNumber(body.capacity),
    minParticipants: parseOptionalNumber(
      body.minParticipants ?? body.min_participants,
    ),
    registrationDeadline: parseOptionalDate(
      body.registrationDeadline ?? body.registration_deadline,
    ),
    price: parseOptionalNumber(body.price),
    groupDiscountMinParticipants: parseOptionalNumber(
      body.groupDiscountMinParticipants ?? body.group_discount_min_participants,
    ),
    groupDiscountPercent: parseOptionalNumber(
      body.groupDiscountPercent ?? body.group_discount_percent,
    ),
    isPrivate: parseOptionalBoolean(body.isPrivate ?? body.is_private, false),
    ageRestriction: body.ageRestriction ?? body.age_restriction,
    notesForClients: body.notesForClients ?? body.notes_for_clients,
  };
}

function validateEventPayload(payload, { partial = false } = {}) {
  if (payload.startsAt === INVALID_DATE) {
    return "startsAt must be a valid ISO date";
  }
  if (payload.endsAt === INVALID_DATE) {
    return "endsAt must be a valid ISO date";
  }
  if (payload.registrationDeadline === INVALID_DATE) {
    return "registrationDeadline must be a valid ISO date";
  }

  if (!partial) {
    if (payload.title == null || String(payload.title).trim() === "") {
      return "title is required";
    }
    if (!(payload.startsAt instanceof Date)) {
      return "startsAt is required";
    }
    if (!(payload.endsAt instanceof Date)) {
      return "endsAt is required";
    }
    if (payload.price == null || Number.isNaN(payload.price)) {
      return "price must be a number";
    }
  }

  const numericFields = [
    ["capacity", payload.capacity],
    ["minParticipants", payload.minParticipants],
    ["price", payload.price],
    ["groupDiscountMinParticipants", payload.groupDiscountMinParticipants],
    ["groupDiscountPercent", payload.groupDiscountPercent],
  ];
  for (const [field, value] of numericFields) {
    if (Number.isNaN(value)) {
      return `${field} must be a number`;
    }
  }

  if (
    payload.startsAt instanceof Date
    && payload.endsAt instanceof Date
    && payload.endsAt <= payload.startsAt
  ) {
    return "endsAt must be greater than startsAt";
  }
  if (
    payload.registrationDeadline instanceof Date
    && payload.startsAt instanceof Date
    && payload.registrationDeadline > payload.startsAt
  ) {
    return "registrationDeadline must be less than or equal to startsAt";
  }

  return null;
}

async function hasEventParticipantsTable() {
  if (hasEventParticipantsTableCache != null) {
    return hasEventParticipantsTableCache;
  }
  const result = await pool.query(
    "SELECT to_regclass('public.event_participants') IS NOT NULL AS exists;",
  );
  hasEventParticipantsTableCache = Boolean(result.rows[0]?.exists);
  return hasEventParticipantsTableCache;
}

function buildDerivedFlags(row) {
  const now = new Date();
  const isFinished = row.ends_at < now;
  const participantCount = Number(row.current_participants ?? 0);
  const capacity = row.capacity != null ? Number(row.capacity) : null;
  const isFull = capacity == null ? false : participantCount >= capacity;
  const registrationDeadline = row.registration_deadline
    ? new Date(row.registration_deadline)
    : null;
  const isRegistrationClosed = row.status !== "published"
    || (registrationDeadline && now > registrationDeadline)
    || now > row.starts_at;

  return {
    isFinished,
    isFull,
    isRegistrationClosed,
  };
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
    minParticipants:
      row.min_participants != null ? Number(row.min_participants) : null,
    registrationDeadline: row.registration_deadline,
    price: row.price != null ? Number(row.price) : null,
    groupDiscountMinParticipants:
      row.group_discount_min_participants != null
        ? Number(row.group_discount_min_participants)
        : null,
    groupDiscountPercent:
      row.group_discount_percent != null ? Number(row.group_discount_percent) : null,
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

function buildSelectWithParticipants(includeParticipants) {
  const participantSelect = includeParticipants
    ? `(SELECT COUNT(*)::int FROM event_participants ep WHERE ep.event_id = e.id) AS current_participants`
    : "0::int AS current_participants";

  return `
    SELECT e.id, e.owner_id, e.title, e.description, e.location,
           e.starts_at, e.ends_at, e.capacity, e.min_participants,
           e.registration_deadline, e.price,
           e.group_discount_min_participants, e.group_discount_percent,
           e.is_private, e.age_restriction, e.notes_for_clients,
           e.status, e.created_at, e.updated_at,
           ${participantSelect}
    FROM events e
  `;
}

async function fetchOwnerEventRowById(eventId, ownerId) {
  const participantsEnabled = await hasEventParticipantsTable();
  const result = await pool.query(
    `${buildSelectWithParticipants(participantsEnabled)}
     WHERE e.id = $1 AND e.owner_id = $2;`,
    [eventId, ownerId],
  );
  return result.rows[0] ?? null;
}

async function fetchOwnerEventWithMedia(client, eventId, ownerId) {
  const participantsEnabled = await hasEventParticipantsTable();
  const result = await client.query(
    `${buildSelectWithParticipants(participantsEnabled)}
     WHERE e.id = $1 AND e.owner_id = $2;`,
    [eventId, ownerId],
  );
  const row = result.rows[0] ?? null;
  if (!row) return null;
  const mediaMap = await fetchEventMediaMap(client, ownerId, [eventId]);
  return mapEventRow(row, mediaMap);
}

async function createOwnerEvent(req, res) {
  try {
    const ownerId = getOwnerId(req);
    const payload = normalizeEventPayload(req.body || {});
    const mediaResult = parseEventMedia(req.body?.media);
    if (mediaResult.error) {
      return res.status(400).json({ error: mediaResult.error });
    }
    const validationError = validateEventPayload(payload);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
      `INSERT INTO events (
         owner_id, title, description, location,
         starts_at, ends_at, capacity, min_participants,
         registration_deadline, price,
         group_discount_min_participants, group_discount_percent,
         is_private, age_restriction, notes_for_clients, status
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8,
         $9, $10,
         $11, $12,
         $13, $14, $15, 'draft'
       )
       RETURNING id;`,
      [
        ownerId,
        String(payload.title).trim(),
        payload.description != null ? String(payload.description) : null,
        payload.location != null ? String(payload.location) : null,
        payload.startsAt,
        payload.endsAt,
        payload.capacity,
        payload.minParticipants,
        payload.registrationDeadline,
        payload.price,
        payload.groupDiscountMinParticipants,
        payload.groupDiscountPercent,
        payload.isPrivate,
        payload.ageRestriction != null ? String(payload.ageRestriction) : null,
        payload.notesForClients != null ? String(payload.notesForClients) : null,
      ],
    );

      if (inserted.rowCount === 0 || !inserted.rows[0]?.id) {
        await client.query("ROLLBACK");
        return res.status(500).json({ error: "Failed to create event" });
      }
      await replaceEventMedia(client, ownerId, inserted.rows[0].id, mediaResult.media);
      const event = await fetchOwnerEventWithMedia(client, inserted.rows[0].id, ownerId);
      if (!event) {
        await client.query("ROLLBACK");
        return res.status(500).json({ error: "Failed to load created event" });
      }
      await client.query("COMMIT");
      return res.status(201).json({ event });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function updateOwnerEvent(req, res) {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;
    const body = { ...(req.body || {}) };
    delete body.status;
    delete body.owner_id;
    delete body.ownerId;
    delete body.id;
    const mediaResult = parseEventMedia(req.body?.media);
    if (mediaResult.error) {
      return res.status(400).json({ error: mediaResult.error });
    }

    const existing = await pool.query(
      `SELECT starts_at, ends_at, registration_deadline
       FROM events
       WHERE id = $1 AND owner_id = $2;`,
      [id, ownerId],
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Event not found" });
    }

    const payload = normalizeEventPayload(body);
    const mergedForValidation = {
      ...payload,
      startsAt: payload.startsAt ?? existing.rows[0].starts_at,
      endsAt: payload.endsAt ?? existing.rows[0].ends_at,
      registrationDeadline:
        payload.registrationDeadline ?? existing.rows[0].registration_deadline,
    };
    const validationError = validateEventPayload(mergedForValidation, {
      partial: true,
    });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
      `UPDATE events
       SET title = COALESCE($3, title),
           description = COALESCE($4, description),
           location = COALESCE($5, location),
           starts_at = COALESCE($6, starts_at),
           ends_at = COALESCE($7, ends_at),
           capacity = COALESCE($8, capacity),
           min_participants = COALESCE($9, min_participants),
           registration_deadline = COALESCE($10, registration_deadline),
           price = COALESCE($11, price),
           group_discount_min_participants = COALESCE($12, group_discount_min_participants),
           group_discount_percent = COALESCE($13, group_discount_percent),
           is_private = COALESCE($14, is_private),
           age_restriction = COALESCE($15, age_restriction),
           notes_for_clients = COALESCE($16, notes_for_clients),
           updated_at = now()
       WHERE id = $1 AND owner_id = $2
       RETURNING id;`,
      [
        id,
        ownerId,
        payload.title != null ? String(payload.title).trim() : null,
        payload.description != null ? String(payload.description) : null,
        payload.location != null ? String(payload.location) : null,
        payload.startsAt,
        payload.endsAt,
        payload.capacity,
        payload.minParticipants,
        payload.registrationDeadline,
        payload.price,
        payload.groupDiscountMinParticipants,
        payload.groupDiscountPercent,
        payload.isPrivate,
        payload.ageRestriction != null ? String(payload.ageRestriction) : null,
        payload.notesForClients != null ? String(payload.notesForClients) : null,
      ],
    );

      if (updated.rowCount === 0 || !updated.rows[0]?.id) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Event not found" });
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "media")) {
        await replaceEventMedia(client, ownerId, updated.rows[0].id, mediaResult.media);
      }
      const event = await fetchOwnerEventWithMedia(client, updated.rows[0].id, ownerId);
      if (!event) {
        await client.query("ROLLBACK");
        return res.status(500).json({ error: "Failed to load updated event" });
      }
      await client.query("COMMIT");
      return res.json({ event });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function listOwnerEvents(req, res) {
  try {
    const ownerId = getOwnerId(req);
    const { status, includePast } = req.query;
    if (status && !EVENT_STATUSES.has(String(status))) {
      return res.status(400).json({ error: "Invalid status filter" });
    }

    const includePastBool = parseOptionalBoolean(includePast, false);
    const participantsEnabled = await hasEventParticipantsTable();
    const result = await pool.query(
      `${buildSelectWithParticipants(participantsEnabled)}
       WHERE e.owner_id = $1
         AND ($2::text IS NULL OR e.status = $2::text)
         AND ($3::boolean = true OR e.ends_at >= now())
       ORDER BY e.starts_at ASC;`,
      [ownerId, status ?? null, includePastBool],
    );

    const mediaMap = await fetchEventMediaMap(pool, ownerId, result.rows.map((r) => r.id));
    return res.json({ events: result.rows.map((row) => mapEventRow(row, mediaMap)) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function getOwnerEvent(req, res) {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;
    const row = await fetchOwnerEventRowById(id, ownerId);
    if (!row) {
      return res.status(404).json({ error: "Event not found" });
    }
    const mediaMap = await fetchEventMediaMap(pool, ownerId, [id]);
    return res.json({ event: mapEventRow(row, mediaMap) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function publishOwnerEvent(req, res) {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;

    const current = await pool.query(
      `SELECT id, status, ends_at
       FROM events
       WHERE id = $1 AND owner_id = $2;`,
      [id, ownerId],
    );
    if (current.rowCount === 0) {
      return res.status(404).json({ error: "Event not found" });
    }

    const row = current.rows[0];
    if (row.status === "cancelled") {
      return res.status(409).json({ error: "Cancelled event cannot be published" });
    }
    if (row.ends_at <= new Date()) {
      return res.status(409).json({ error: "Past event cannot be published" });
    }

    if (row.status !== "published") {
      await pool.query(
        `UPDATE events
         SET status = 'published', updated_at = now()
         WHERE id = $1;`,
        [id],
      );
    }

    return getOwnerEvent(req, res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function cancelOwnerEvent(req, res) {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;

    const exists = await pool.query(
      `SELECT id
       FROM events
       WHERE id = $1 AND owner_id = $2;`,
      [id, ownerId],
    );
    if (exists.rowCount === 0) {
      return res.status(404).json({ error: "Event not found" });
    }

    await pool.query(
      `UPDATE events
       SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND status <> 'cancelled';`,
      [id],
    );

    return getOwnerEvent(req, res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function moveOwnerEventToDraft(req, res) {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;

    const current = await pool.query(
      `SELECT id, status
       FROM events
       WHERE id = $1 AND owner_id = $2;`,
      [id, ownerId],
    );
    if (current.rowCount === 0) {
      return res.status(404).json({ error: "Event not found" });
    }
    if (current.rows[0].status === "cancelled") {
      return res.status(409).json({ error: "Cancelled event cannot be moved to draft" });
    }

    if (current.rows[0].status !== "draft") {
      await pool.query(
        `UPDATE events
         SET status = 'draft', updated_at = now()
         WHERE id = $1;`,
        [id],
      );
    }

    return getOwnerEvent(req, res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function deleteOwnerEvent(req, res) {
  try {
    const ownerId = getOwnerId(req);
    const { id } = req.params;

    const deleted = await pool.query(
      `DELETE FROM events
       WHERE id = $1 AND owner_id = $2
       RETURNING id;`,
      [id, ownerId],
    );

    if (deleted.rowCount === 0) {
      return res.status(404).json({ error: "Event not found" });
    }

    return res.json({ deleted: true, eventId: deleted.rows[0].id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  createOwnerEvent,
  updateOwnerEvent,
  listOwnerEvents,
  getOwnerEvent,
  publishOwnerEvent,
  cancelOwnerEvent,
  moveOwnerEventToDraft,
  deleteOwnerEvent,
};

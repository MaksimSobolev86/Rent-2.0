const pool = require("../../../db");

async function listOwnerHolidays(req, res) {
  try {
    const ownerId = req.user.id;
    const result = await pool.query(
      `SELECT id, date, name
       FROM owner_holidays
       WHERE owner_id = $1
       ORDER BY date;`,
      [ownerId],
    );
    return res.json({
      holidays: result.rows.map((r) => ({
        id: r.id,
        date: r.date,
        name: r.name,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function upsertOwnerHoliday(req, res) {
  try {
    const ownerId = req.user.id;
    const { date, name } = req.body || {};
    if (!date || typeof date !== "string") {
      return res.status(400).json({ error: "date is required in YYYY-MM-DD format" });
    }
    const result = await pool.query(
      `INSERT INTO owner_holidays (owner_id, date, name)
       VALUES ($1, $2::date, $3)
       ON CONFLICT (owner_id, date)
       DO UPDATE SET name = EXCLUDED.name
       RETURNING id, date, name;`,
      [ownerId, date, name != null ? String(name) : null],
    );
    return res.status(201).json({ holiday: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function deleteOwnerHoliday(req, res) {
  try {
    const ownerId = req.user.id;
    const { date } = req.params;
    await pool.query(
      `DELETE FROM owner_holidays
       WHERE owner_id = $1
         AND date = $2::date;`,
      [ownerId, date],
    );
    return res.json({ deleted: true, date });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function listOwnerWeekdayRules(req, res) {
  try {
    const ownerId = req.user.id;
    const result = await pool.query(
      `SELECT id, weekday, is_weekend
       FROM owner_weekday_rules
       WHERE owner_id = $1
       ORDER BY weekday;`,
      [ownerId],
    );
    return res.json({
      rules: result.rows,
      weekends: result.rows.filter((r) => r.is_weekend).map((r) => r.weekday),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function updateOwnerWeekdayRules(req, res) {
  const client = await pool.connect();
  try {
    const ownerId = req.user.id;
    const weekends = Array.isArray(req.body?.weekends) ? req.body.weekends : null;
    if (!weekends) {
      return res.status(400).json({ error: "weekends must be an array of weekday numbers 0..6" });
    }
    const normalized = [...new Set(weekends.map((v) => Number(v)))];
    if (normalized.some((v) => !Number.isInteger(v) || v < 0 || v > 6)) {
      return res.status(400).json({ error: "weekends must contain integers in range 0..6" });
    }

    await client.query("BEGIN");
    await client.query(`DELETE FROM owner_weekday_rules WHERE owner_id = $1;`, [ownerId]);
    for (let day = 0; day <= 6; day += 1) {
      await client.query(
        `INSERT INTO owner_weekday_rules (owner_id, weekday, is_weekend)
         VALUES ($1, $2, $3);`,
        [ownerId, day, normalized.includes(day)],
      );
    }
    await client.query("COMMIT");

    return res.json({ updated: true, weekends: normalized });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}

async function listOwnerClients(req, res) {
  try {
    const ownerId = req.user.id;
    const result = await pool.query(
      `SELECT c.id, c.vk_user_id, c.first_name, c.last_name, c.phone, c.photo_url, c.role, c.created_at
       FROM owner_clients oc
       JOIN clients c ON c.id = oc.client_id
       WHERE oc.owner_id = $1
       ORDER BY oc.created_at DESC;`,
      [ownerId],
    );
    return res.json({
      clients: result.rows.map((r) => ({
        id: r.id,
        vkUserId: r.vk_user_id,
        firstName: r.first_name,
        lastName: r.last_name,
        phone: r.phone,
        photoUrl: r.photo_url,
        role: r.role,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listOwnerHolidays,
  upsertOwnerHoliday,
  deleteOwnerHoliday,
  listOwnerWeekdayRules,
  updateOwnerWeekdayRules,
  listOwnerClients,
};

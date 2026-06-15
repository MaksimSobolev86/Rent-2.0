const pool = require("../../db");
const { ensureAppSchema } = require("../../utils/ensureAppSchema");

function parseVkUserId(raw) {
  if (raw == null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

async function assertTargetBelongsToOwner(ownerId, targetType, targetId) {
  if (targetType === "item") {
    const result = await pool.query(
      `SELECT id FROM items WHERE id = $1::uuid AND owner_id = $2::uuid LIMIT 1;`,
      [targetId, ownerId],
    );
    return result.rowCount > 0;
  }

  if (targetType === "event") {
    const result = await pool.query(
      `SELECT id FROM events WHERE id = $1::uuid AND owner_id = $2::uuid LIMIT 1;`,
      [targetId, ownerId],
    );
    return result.rowCount > 0;
  }

  return false;
}

async function listFavorites(req, res) {
  try {
    await ensureAppSchema();

    const vkUserId = parseVkUserId(req.query.vkUserId ?? req.query.vk_user_id);
    const ownerId = String(req.query.ownerId ?? req.query.owner_id ?? "").trim();

    if (!vkUserId) {
      return res.status(400).json({ error: "vkUserId is required" });
    }
    if (!ownerId) {
      return res.status(400).json({ error: "ownerId is required" });
    }

    const result = await pool.query(
      `SELECT target_type, target_id, created_at
       FROM favorites
       WHERE vk_user_id = $1 AND owner_id = $2::uuid
       ORDER BY created_at DESC;`,
      [vkUserId, ownerId],
    );

    const favorites = result.rows.map((row) => ({
      targetType: row.target_type,
      targetId: row.target_id,
      createdAt: row.created_at,
    }));

    return res.json({ favorites });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function toggleFavorite(req, res) {
  try {
    await ensureAppSchema();

    const b = req.body || {};
    const vkUserId = parseVkUserId(b.vkUserId ?? b.vk_user_id);
    const ownerId = String(b.ownerId ?? b.owner_id ?? "").trim();
    const targetType = String(b.targetType ?? b.target_type ?? "").trim().toLowerCase();
    const targetId = String(b.targetId ?? b.target_id ?? "").trim();

    if (!vkUserId) {
      return res.status(400).json({ error: "vkUserId is required" });
    }
    if (!ownerId) {
      return res.status(400).json({ error: "ownerId is required" });
    }
    if (!targetId) {
      return res.status(400).json({ error: "targetId is required" });
    }
    if (targetType !== "item" && targetType !== "event") {
      return res.status(400).json({ error: "targetType must be item or event" });
    }

    const belongs = await assertTargetBelongsToOwner(ownerId, targetType, targetId);
    if (!belongs) {
      return res.status(404).json({ error: "Target not found in this shop" });
    }

    const existing = await pool.query(
      `SELECT id
       FROM favorites
       WHERE vk_user_id = $1
         AND target_type = $2
         AND target_id = $3::uuid
       LIMIT 1;`,
      [vkUserId, targetType, targetId],
    );

    if (existing.rowCount > 0) {
      await pool.query(`DELETE FROM favorites WHERE id = $1;`, [existing.rows[0].id]);
      return res.json({ favorited: false, targetType, targetId });
    }

    const inserted = await pool.query(
      `INSERT INTO favorites (vk_user_id, owner_id, target_type, target_id)
       VALUES ($1, $2::uuid, $3, $4::uuid)
       RETURNING id, created_at;`,
      [vkUserId, ownerId, targetType, targetId],
    );

    return res.json({
      favorited: true,
      targetType,
      targetId,
      id: inserted.rows[0].id,
      createdAt: inserted.rows[0].created_at,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { listFavorites, toggleFavorite };

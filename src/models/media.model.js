const pool = require("../db");

async function getMediaMap(targetType, targetIds, { ownerId = null, client = pool } = {}) {
  if (!targetIds || targetIds.length === 0) return new Map();
  const result = await client.query(
    `SELECT id, owner_id, target_id, target_type, url, type, sort_order
     FROM media
     WHERE target_type = $1
       AND target_id = ANY($2::uuid[])
       AND ($3::uuid IS NULL OR owner_id = $3::uuid)
     ORDER BY target_id, sort_order ASC, created_at ASC;`,
    [targetType, targetIds, ownerId],
  );

  const map = new Map();
  result.rows.forEach((row) => {
    if (!map.has(row.target_id)) map.set(row.target_id, []);
    map.get(row.target_id).push({
      id: row.id,
      url: row.url,
      type: row.type,
      sortOrder: row.sort_order,
      ownerId: row.owner_id,
    });
  });
  return map;
}

async function replaceMedia(ownerId, targetType, targetId, media, { client = pool } = {}) {
  await client.query(
    `DELETE FROM media
     WHERE owner_id = $1
       AND target_type = $2
       AND target_id = $3;`,
    [ownerId, targetType, targetId],
  );

  if (!media || media.length === 0) return;

  const values = [];
  const placeholders = [];
  media.forEach((m, index) => {
    const base = index * 6;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`,
    );
    values.push(ownerId, targetType, targetId, m.url, m.type, m.sortOrder);
  });

  await client.query(
    `INSERT INTO media (owner_id, target_type, target_id, url, type, sort_order)
     VALUES ${placeholders.join(", ")};`,
    values,
  );
}

module.exports = { getMediaMap, replaceMedia };

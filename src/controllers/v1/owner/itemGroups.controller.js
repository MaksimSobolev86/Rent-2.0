const { randomUUID } = require("crypto");

const pool = require("../../../db");
const { ensureItemGroupsSchema } = require("../../../utils/ensureItemGroupsSchema");

function mapGroupRow(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    sortOrder: row.sort_order,
    itemCount: row.item_count != null ? Number(row.item_count) : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listOwnerItemGroups(req, res) {
  try {
    await ensureItemGroupsSchema();
    const ownerId = req.user.id;
    const result = await pool.query(
      `SELECT g.id, g.owner_id, g.name, g.sort_order, g.created_at, g.updated_at,
              COUNT(i.id)::int AS item_count
       FROM item_groups g
       LEFT JOIN items i ON i.group_id = g.id
       WHERE g.owner_id = $1
       GROUP BY g.id
       ORDER BY g.sort_order ASC, g.name ASC;`,
      [ownerId],
    );
    return res.json({ groups: result.rows.map(mapGroupRow) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function createOwnerItemGroup(req, res) {
  try {
    await ensureItemGroupsSchema();
    const ownerId = req.user.id;
    const name = String(req.body?.name ?? "").trim();
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const sortOrderRaw = req.body?.sortOrder ?? req.body?.sort_order;
    const sortOrder = sortOrderRaw != null && Number.isFinite(Number(sortOrderRaw))
      ? Number(sortOrderRaw)
      : 0;

    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO item_groups (id, owner_id, name, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id, owner_id, name, sort_order, created_at, updated_at;`,
      [id, ownerId, name, sortOrder],
    );
    return res.status(201).json({ group: { ...mapGroupRow(result.rows[0]), itemCount: 0 } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function updateOwnerItemGroup(req, res) {
  try {
    await ensureItemGroupsSchema();
    const ownerId = req.user.id;
    const { groupId } = req.params;
    const nameRaw = req.body?.name;
    const sortOrderRaw = req.body?.sortOrder ?? req.body?.sort_order;

    if (nameRaw === undefined && sortOrderRaw === undefined) {
      return res.status(400).json({ error: "name or sortOrder is required" });
    }

    const existing = await pool.query(
      `SELECT id FROM item_groups WHERE id = $1 AND owner_id = $2;`,
      [groupId, ownerId],
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Group not found" });
    }

    const name = nameRaw !== undefined ? String(nameRaw).trim() : null;
    if (nameRaw !== undefined && !name) {
      return res.status(400).json({ error: "name cannot be empty" });
    }
    const sortOrder = sortOrderRaw !== undefined && Number.isFinite(Number(sortOrderRaw))
      ? Number(sortOrderRaw)
      : null;

    const result = await pool.query(
      `UPDATE item_groups
       SET name = COALESCE($3, name),
           sort_order = COALESCE($4, sort_order),
           updated_at = now()
       WHERE id = $1 AND owner_id = $2
       RETURNING id, owner_id, name, sort_order, created_at, updated_at;`,
      [groupId, ownerId, name, sortOrder],
    );

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS item_count FROM items WHERE group_id = $1;`,
      [groupId],
    );
    return res.json({
      group: {
        ...mapGroupRow(result.rows[0]),
        itemCount: countRes.rows[0]?.item_count ?? 0,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function deleteOwnerItemGroup(req, res) {
  try {
    await ensureItemGroupsSchema();
    const ownerId = req.user.id;
    const { groupId } = req.params;

    const existing = await pool.query(
      `SELECT id FROM item_groups WHERE id = $1 AND owner_id = $2;`,
      [groupId, ownerId],
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Group not found" });
    }

    await pool.query(`DELETE FROM item_groups WHERE id = $1 AND owner_id = $2;`, [groupId, ownerId]);
    return res.json({ deleted: true, groupId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listOwnerItemGroups,
  createOwnerItemGroup,
  updateOwnerItemGroup,
  deleteOwnerItemGroup,
};

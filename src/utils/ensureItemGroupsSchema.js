const pool = require("../db");

let itemGroupsSchemaReady = null;

async function ensureItemGroupsSchema(client = pool) {
  if (itemGroupsSchemaReady) {
    return itemGroupsSchemaReady;
  }

  itemGroupsSchemaReady = (async () => {
    await client.query(
      `CREATE TABLE IF NOT EXISTS item_groups (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
         name TEXT NOT NULL,
         sort_order INTEGER NOT NULL DEFAULT 0,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       );`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_item_groups_owner_sort
         ON item_groups (owner_id, sort_order, name);`,
    );
    await client.query(
      `ALTER TABLE items
         ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES item_groups(id) ON DELETE SET NULL;`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_items_group_id ON items (group_id);`,
    );
  })();

  try {
    await itemGroupsSchemaReady;
  } catch (err) {
    itemGroupsSchemaReady = null;
    throw err;
  }
}

module.exports = { ensureItemGroupsSchema };

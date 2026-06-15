const pool = require("../db");
const { ensureBookingsRentPeriodColumns } = require("./rentBookingPeriod");

let ownerSchemaReady = null;

/**
 * Adds owners.photo_url when the DB was created before that column existed.
 * Safe to call repeatedly (cached after first success).
 */
async function ensureOwnerSchema() {
  if (ownerSchemaReady) {
    return ownerSchemaReady;
  }

  ownerSchemaReady = (async () => {
    await pool.query(`ALTER TABLE owners ADD COLUMN IF NOT EXISTS photo_url TEXT;`);
    await pool.query(`ALTER TABLE owners ADD COLUMN IF NOT EXISTS shop_name TEXT;`);
    await pool.query(`ALTER TABLE owners ADD COLUMN IF NOT EXISTS shop_photo_url TEXT;`);
    await pool.query(`ALTER TABLE owners ADD COLUMN IF NOT EXISTS description TEXT;`);
    await pool.query(`ALTER TABLE owners ADD COLUMN IF NOT EXISTS shop_address TEXT;`);
    await pool.query(`ALTER TABLE owners ADD COLUMN IF NOT EXISTS address_map_provider TEXT;`);
    await pool.query(`ALTER TABLE owners ADD COLUMN IF NOT EXISTS address_latitude DOUBLE PRECISION;`);
    await pool.query(`ALTER TABLE owners ADD COLUMN IF NOT EXISTS address_longitude DOUBLE PRECISION;`);
    await pool.query(`ALTER TABLE owners ADD COLUMN IF NOT EXISTS address_map_url TEXT;`);
    await pool.query(`ALTER TABLE owners ADD COLUMN IF NOT EXISTS yandex_map_constructor_um TEXT;`);
    await pool.query(`ALTER TABLE owners ADD COLUMN IF NOT EXISTS dgis_map_constructor_embed TEXT;`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS owner_special_offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        link_url TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_owner_special_offers_owner_sort
      ON owner_special_offers (owner_id, sort_order);
    `);
    await pool.query(`
      ALTER TABLE owner_special_offers
      ADD COLUMN IF NOT EXISTS link_item_id UUID REFERENCES items(id) ON DELETE SET NULL;
    `);
    await pool.query(`
      ALTER TABLE owner_special_offers
      ADD COLUMN IF NOT EXISTS link_event_id UUID REFERENCES events(id) ON DELETE SET NULL;
    `);
    await ensureBookingsRentPeriodColumns(pool);
  })();

  try {
    await ownerSchemaReady;
  } catch (err) {
    ownerSchemaReady = null;
    throw err;
  }
}

module.exports = { ensureOwnerSchema };

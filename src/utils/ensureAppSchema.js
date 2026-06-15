const pool = require("../db");
const { ensureOwnerSchema } = require("./ensureOwnerSchema");
const { ensureItemGroupsSchema } = require("./ensureItemGroupsSchema");
let appSchemaReady = null;

async function ensureOwnerClientsTable(client = pool) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS owner_clients (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
       client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       UNIQUE (owner_id, client_id)
     );`,
  );
}

async function ensureEventsTable(client = pool) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS events (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
       title TEXT NOT NULL,
       description TEXT,
       location TEXT,
       starts_at TIMESTAMPTZ NOT NULL,
       ends_at TIMESTAMPTZ NOT NULL,
       capacity INTEGER,
       min_participants INTEGER,
       registration_deadline TIMESTAMPTZ,
       price NUMERIC(10,2) NOT NULL,
       group_discount_min_participants INTEGER,
       group_discount_percent NUMERIC(5,2),
       is_private BOOLEAN NOT NULL DEFAULT false,
       age_restriction TEXT,
       notes_for_clients TEXT,
       status TEXT NOT NULL DEFAULT 'draft',
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS idx_events_owner_starts
       ON events (owner_id, starts_at);`,
  );
}

async function ensureEventParticipantsTable(client = pool) {
  await ensureEventsTable(client);
  await client.query(
    `CREATE TABLE IF NOT EXISTS event_participants (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
       client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
       note TEXT,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       UNIQUE (event_id, client_id)
     );`,
  );
}

async function ensureFavoritesTable(client = pool) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS favorites (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       vk_user_id BIGINT NOT NULL,
       owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
       target_type TEXT NOT NULL,
       target_id UUID NOT NULL,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       CHECK (target_type IN ('item', 'event')),
       UNIQUE (vk_user_id, target_type, target_id)
     );`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS favorites_owner_vk_user_idx
       ON favorites (owner_id, vk_user_id);`,
  );
}

async function ensureAppSchema() {
  if (appSchemaReady) {
    return appSchemaReady;
  }

  appSchemaReady = (async () => {
    await ensureOwnerSchema();
    await ensureOwnerClientsTable();
    await ensureEventsTable();
    await ensureEventParticipantsTable();
    await ensureFavoritesTable();
    await ensureItemGroupsSchema();
  })();

  try {
    await appSchemaReady;
  } catch (err) {
    appSchemaReady = null;
    throw err;
  }
}

module.exports = {
  ensureAppSchema,
  ensureOwnerClientsTable,
  ensureEventParticipantsTable,
};

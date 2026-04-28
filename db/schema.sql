CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vk_user_id  BIGINT,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  phone       TEXT,
  photo_url   TEXT,
  role        TEXT NOT NULL DEFAULT 'CLIENT',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS owners (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  phone       TEXT,
  photo_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES owners(id),
  name           TEXT NOT NULL,
  description    TEXT,
  status         TEXT,
  is_for_sale    BOOLEAN NOT NULL DEFAULT false,
  is_for_rent    BOOLEAN NOT NULL DEFAULT false,
  sale_price     NUMERIC(10,2),
  weekday_price_hour  NUMERIC(10,2),
  weekday_price_week  NUMERIC(10,2),
  weekday_price_month NUMERIC(10,2),
  weekend_price_hour  NUMERIC(10,2),
  weekend_price_week  NUMERIC(10,2),
  weekend_price_month NUMERIC(10,2),
  holiday_price_hour  NUMERIC(10,2),
  holiday_price_week  NUMERIC(10,2),
  holiday_price_month NUMERIC(10,2),
  price          NUMERIC(10,2),
  price_per_hour NUMERIC(10,2),
  price_per_week NUMERIC(10,2),
  price_per_month NUMERIC(10,2),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id   UUID NOT NULL,
  url         TEXT NOT NULL,
  type        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (target_type IN ('item', 'event')),
  CHECK (type IN ('image', 'video'))
);

CREATE TABLE IF NOT EXISTS bookings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clients(id),
  item_id      UUID NOT NULL REFERENCES items(id),
  start_at     TIMESTAMPTZ NOT NULL,
  end_at       TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  total_price  NUMERIC(10,2),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS owner_clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES owners(id),
  client_id   UUID NOT NULL REFERENCES clients(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, client_id)
);

CREATE TABLE IF NOT EXISTS owner_holidays (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id  UUID NOT NULL REFERENCES owners(id),
  date      DATE NOT NULL,
  name      TEXT,
  UNIQUE (owner_id, date)
);

CREATE TABLE IF NOT EXISTS owner_weekday_rules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES owners(id),
  weekday    SMALLINT NOT NULL,
  is_weekend BOOLEAN NOT NULL,
  UNIQUE (owner_id, weekday)
);

CREATE TABLE IF NOT EXISTS bases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  address     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


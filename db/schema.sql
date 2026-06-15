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
  shop_name   TEXT,
  shop_photo_url TEXT,
  description TEXT,
  shop_address TEXT,
  address_map_provider TEXT,
  address_map_url TEXT,
  address_latitude DOUBLE PRECISION,
  address_longitude DOUBLE PRECISION,
  yandex_map_constructor_um TEXT,
  dgis_map_constructor_embed TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS item_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_groups_owner_sort
  ON item_groups (owner_id, sort_order, name);

CREATE TABLE IF NOT EXISTS items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES owners(id),
  group_id       UUID REFERENCES item_groups(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  description    TEXT,
  status         TEXT,
  is_for_sale    BOOLEAN NOT NULL DEFAULT false,
  is_for_rent    BOOLEAN NOT NULL DEFAULT false,
  sale_price     NUMERIC(10,2),
  weekday_price_hour  NUMERIC(10,2),
  weekday_price_day   NUMERIC(10,2),
  weekday_price_week  NUMERIC(10,2),
  weekday_price_month NUMERIC(10,2),
  weekend_price_hour  NUMERIC(10,2),
  weekend_price_day   NUMERIC(10,2),
  weekend_price_week  NUMERIC(10,2),
  weekend_price_month NUMERIC(10,2),
  holiday_price_hour  NUMERIC(10,2),
  holiday_price_day   NUMERIC(10,2),
  holiday_price_week  NUMERIC(10,2),
  holiday_price_month NUMERIC(10,2),
  price          NUMERIC(10,2),
  price_per_hour NUMERIC(10,2),
  price_per_day  NUMERIC(10,2),
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
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id),
  item_id        UUID NOT NULL REFERENCES items(id),
  owner_id       UUID REFERENCES owners(id),
  start_at       TIMESTAMPTZ NOT NULL,
  end_at         TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  type           TEXT NOT NULL DEFAULT 'rent',
  rent_period    TEXT,
  check_in_date  DATE,
  check_out_date DATE,
  nights_count   INTEGER,
  total_price    NUMERIC(10,2),
  currency       TEXT DEFAULT 'RUB',
  client_name    TEXT,
  client_phone   TEXT,
  client_comment TEXT,
  event_id       UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
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

CREATE TABLE IF NOT EXISTS events (
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
);

CREATE INDEX IF NOT EXISTS idx_events_owner_starts ON events (owner_id, starts_at);

CREATE TABLE IF NOT EXISTS event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, client_id)
);

-- Promo banners for VK Mini App carousel (max 6 per owner).
CREATE TABLE IF NOT EXISTS owner_special_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  link_url TEXT,
  link_item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  link_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_special_offers_owner_sort
  ON owner_special_offers (owner_id, sort_order);

-- VK Mini App: user favorites (heart on item/event cards).
CREATE TABLE IF NOT EXISTS favorites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vk_user_id   BIGINT NOT NULL,
  owner_id     UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL,
  target_id    UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (target_type IN ('item', 'event')),
  UNIQUE (vk_user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS favorites_owner_vk_user_idx
  ON favorites (owner_id, vk_user_id);


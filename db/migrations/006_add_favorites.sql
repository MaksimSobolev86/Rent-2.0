-- Favorites (heart) in VK Mini App: links VK user to item or event within an owner's shop.
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

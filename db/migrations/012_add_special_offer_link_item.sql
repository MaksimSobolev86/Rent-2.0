ALTER TABLE owner_special_offers
  ADD COLUMN IF NOT EXISTS link_item_id UUID REFERENCES items(id) ON DELETE SET NULL;

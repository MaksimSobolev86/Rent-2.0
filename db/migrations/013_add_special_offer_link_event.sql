ALTER TABLE owner_special_offers
  ADD COLUMN IF NOT EXISTS link_event_id UUID REFERENCES events(id) ON DELETE SET NULL;

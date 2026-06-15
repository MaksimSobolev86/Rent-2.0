-- API keys for maps (per owner; used in admin + VK mini app for this shop only).
ALTER TABLE owners ADD COLUMN IF NOT EXISTS yandex_maps_api_key TEXT;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS dgis_api_key TEXT;

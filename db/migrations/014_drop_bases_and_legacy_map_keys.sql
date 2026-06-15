-- Unused legacy table (no API routes).
DROP TABLE IF EXISTS bases CASCADE;

-- Replaced by map constructor embed fields (yandex_map_constructor_um, dgis_map_constructor_embed).
ALTER TABLE owners DROP COLUMN IF EXISTS yandex_maps_api_key;
ALTER TABLE owners DROP COLUMN IF EXISTS dgis_api_key;

-- Shop address from Yandex Maps or 2GIS (one provider per owner).
ALTER TABLE owners ADD COLUMN IF NOT EXISTS shop_address TEXT;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS address_map_provider TEXT;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS address_map_url TEXT;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS address_latitude DOUBLE PRECISION;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS address_longitude DOUBLE PRECISION;

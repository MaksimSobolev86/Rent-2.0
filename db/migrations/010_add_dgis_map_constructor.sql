-- Карта из Конструктора 2ГИС (makemap.2gis.ru), JSON: iframe или виджет
ALTER TABLE owners ADD COLUMN IF NOT EXISTS dgis_map_constructor_embed TEXT;

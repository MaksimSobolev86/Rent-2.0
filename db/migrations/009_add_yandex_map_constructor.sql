-- Карта из Конструктора Яндекс.Карт (um=constructor:…), без JavaScript API
ALTER TABLE owners ADD COLUMN IF NOT EXISTS yandex_map_constructor_um TEXT;

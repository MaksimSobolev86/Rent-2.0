-- Shop info attached to the owner (shown to buyers in the VK Mini App).
-- photo_url      = small avatar shown in the VK Mini App header (top-left)
-- shop_photo_url = large shop photo shown on the shop profile (opened by tapping the avatar)
ALTER TABLE owners ADD COLUMN IF NOT EXISTS shop_name TEXT;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS shop_photo_url TEXT;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS description TEXT;

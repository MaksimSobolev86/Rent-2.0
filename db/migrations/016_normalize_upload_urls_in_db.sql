-- Fix rows saved with absolute origin before normalizeOwnerUploadPublicUrl.
UPDATE owner_special_offers
SET image_url = substring(image_url FROM position('/uploads/' IN image_url))
WHERE image_url LIKE 'http%/uploads/%';

UPDATE owners
SET photo_url = substring(photo_url FROM position('/uploads/' IN photo_url))
WHERE photo_url LIKE 'http%/uploads/%';

UPDATE owners
SET shop_photo_url = substring(shop_photo_url FROM position('/uploads/' IN shop_photo_url))
WHERE shop_photo_url LIKE 'http%/uploads/%';

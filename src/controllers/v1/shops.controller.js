const pool = require("../../db");
const { ensureOwnerSchema } = require("../../utils/ensureOwnerSchema");
const { resolveCatalogOwnerId } = require("../../utils/ownerScope");
const { toAbsoluteMediaUrl } = require("../../utils/publicUrl");
const { parseDgisMapConstructorEmbedPublic } = require("../../utils/shopAddress");
const { listOwnerSpecialOffers } = require("../../utils/specialOffers");

function mapPublicShopRow(row) {
  return {
    ownerId: row.id,
    shopName: row.shop_name,
    photoUrl: toAbsoluteMediaUrl(row.photo_url),
    shopPhotoUrl: toAbsoluteMediaUrl(row.shop_photo_url),
    description: row.description,
    shopAddress: row.shop_address,
    addressMapProvider: row.address_map_provider,
    addressMapUrl: row.address_map_url,
    addressLatitude: row.address_latitude != null ? Number(row.address_latitude) : null,
    addressLongitude: row.address_longitude != null ? Number(row.address_longitude) : null,
    yandexMapConstructorUm: row.yandex_map_constructor_um?.trim() || null,
    dgisMapConstructorEmbed: parseDgisMapConstructorEmbedPublic(row.dgis_map_constructor_embed),
  };
}

async function getShopProfile(req, res) {
  try {
    await ensureOwnerSchema();
    const ownerId = resolveCatalogOwnerId(req);
    if (!ownerId) {
      return res.status(400).json({ error: "ownerId query parameter is required" });
    }

    const result = await pool.query(
      `SELECT id, photo_url, shop_name, shop_photo_url, description,
              shop_address, address_map_provider, address_map_url, address_latitude, address_longitude,
              yandex_map_constructor_um, dgis_map_constructor_embed
       FROM owners
       WHERE id = $1;`,
      [ownerId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Shop not found" });
    }

    const specialOffers = await listOwnerSpecialOffers(ownerId);
    return res.json({
      shop: {
        ...mapPublicShopRow(result.rows[0]),
        specialOffers,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getShopProfile };

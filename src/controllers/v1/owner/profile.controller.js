const pool = require("../../../db");
const { ensureOwnerSchema } = require("../../../utils/ensureOwnerSchema");
const { isAllowedOwnerPhotoUrl } = require("../../../utils/processImage");
const { toAbsoluteMediaUrl } = require("../../../utils/publicUrl");
const {
  normalizeOwnerUploadPublicUrl,
  tryDeleteOwnerUploadByPublicPath,
} = require("../../../utils/uploadsPaths");
const {
  parseAddressMapProvider,
  parseAddressMapUrl,
  parseOptionalCoord,
  parseShopAddress,
  parseYandexMapConstructorUm,
  parseDgisMapConstructorEmbed,
  parseDgisMapConstructorEmbedPublic,
} = require("../../../utils/shopAddress");

const OWNER_SHOP_COLUMNS = `
  id, email, first_name, last_name, phone, photo_url, shop_name, shop_photo_url, description,
  shop_address, address_map_provider, address_map_url, address_latitude, address_longitude,
  yandex_map_constructor_um, dgis_map_constructor_embed,
  created_at, updated_at
`;

function mapOwnerRow(row) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    photoUrl: toAbsoluteMediaUrl(row.photo_url),
    shopName: row.shop_name,
    shopPhotoUrl: toAbsoluteMediaUrl(row.shop_photo_url),
    description: row.description,
    shopAddress: row.shop_address,
    addressMapProvider: row.address_map_provider,
    addressMapUrl: row.address_map_url,
    addressLatitude: row.address_latitude != null ? Number(row.address_latitude) : null,
    addressLongitude: row.address_longitude != null ? Number(row.address_longitude) : null,
    yandexMapConstructorUm: row.yandex_map_constructor_um,
    dgisMapConstructorEmbed: parseDgisMapConstructorEmbedPublic(row.dgis_map_constructor_embed),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getOwnerProfile(req, res) {
  try {
    await ensureOwnerSchema();
    const ownerId = req.user.id;
    const result = await pool.query(
      `SELECT ${OWNER_SHOP_COLUMNS}
       FROM owners
       WHERE id = $1;`,
      [ownerId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Owner not found" });
    }
    return res.json({ owner: mapOwnerRow(result.rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function updateOwnerProfile(req, res) {
  try {
    await ensureOwnerSchema();
    const ownerId = req.user.id;
    const b = req.body || {};

    const existing = await pool.query(
      `SELECT ${OWNER_SHOP_COLUMNS}
       FROM owners
       WHERE id = $1;`,
      [ownerId],
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Owner not found" });
    }

    const current = existing.rows[0];
    const previousPhotoUrl = current.photo_url;
    const previousShopPhotoUrl = current.shop_photo_url;
    const firstName = (b.first_name ?? b.firstName ?? current.first_name ?? "").toString().trim();
    const lastName = (b.last_name ?? b.lastName ?? current.last_name ?? "").toString().trim();
    const phoneRaw = b.phone;
    const phone = phoneRaw === undefined
      ? current.phone
      : phoneRaw != null && String(phoneRaw).trim() !== ""
        ? String(phoneRaw).trim()
        : null;

    let photoUrl = current.photo_url;
    if (b.photoUrl !== undefined || b.photo_url !== undefined) {
      const rawPhoto = b.photoUrl ?? b.photo_url;
      photoUrl = rawPhoto != null && String(rawPhoto).trim() !== ""
        ? String(rawPhoto).trim()
        : null;
    }

    let shopName = current.shop_name;
    if (b.shopName !== undefined || b.shop_name !== undefined) {
      const rawShopName = b.shopName ?? b.shop_name;
      shopName = rawShopName != null && String(rawShopName).trim() !== ""
        ? String(rawShopName).replace(/\s+/g, " ").trim().slice(0, 60)
        : null;
    }

    let shopPhotoUrl = current.shop_photo_url;
    if (b.shopPhotoUrl !== undefined || b.shop_photo_url !== undefined) {
      const rawShopPhoto = b.shopPhotoUrl ?? b.shop_photo_url;
      shopPhotoUrl = rawShopPhoto != null && String(rawShopPhoto).trim() !== ""
        ? String(rawShopPhoto).trim()
        : null;
    }

    if (photoUrl) photoUrl = normalizeOwnerUploadPublicUrl(ownerId, photoUrl);
    if (shopPhotoUrl) shopPhotoUrl = normalizeOwnerUploadPublicUrl(ownerId, shopPhotoUrl);

    let description = current.description;
    if (b.description !== undefined) {
      description = b.description != null && String(b.description).trim() !== ""
        ? String(b.description).trim()
        : null;
    }

    const shopAddressResult = parseShopAddress(
      b.shopAddress !== undefined ? b.shopAddress : b.shop_address,
    );
    if (shopAddressResult.error) {
      return res.status(400).json({ error: shopAddressResult.error });
    }
    let shopAddress = current.shop_address;
    if (shopAddressResult.value !== undefined) {
      shopAddress = shopAddressResult.value;
    }

    const providerResult = parseAddressMapProvider(
      b.addressMapProvider !== undefined ? b.addressMapProvider : b.address_map_provider,
    );
    if (providerResult.error) {
      return res.status(400).json({ error: providerResult.error });
    }
    let addressMapProvider = current.address_map_provider;
    if (providerResult.value !== undefined) {
      addressMapProvider = providerResult.value;
    }

    const mapUrlResult = parseAddressMapUrl(
      b.addressMapUrl !== undefined ? b.addressMapUrl : b.address_map_url,
    );
    if (mapUrlResult.error) {
      return res.status(400).json({ error: mapUrlResult.error });
    }
    let addressMapUrl = current.address_map_url;
    if (mapUrlResult.value !== undefined) {
      addressMapUrl = mapUrlResult.value;
    }

    const latResult = parseOptionalCoord(
      b.addressLatitude !== undefined ? b.addressLatitude : b.address_latitude,
      "address_latitude",
    );
    if (latResult.error) {
      return res.status(400).json({ error: latResult.error });
    }
    let addressLatitude = current.address_latitude;
    if (latResult.value !== undefined) {
      addressLatitude = latResult.value;
    }

    const lonResult = parseOptionalCoord(
      b.addressLongitude !== undefined ? b.addressLongitude : b.address_longitude,
      "address_longitude",
    );
    if (lonResult.error) {
      return res.status(400).json({ error: lonResult.error });
    }
    let addressLongitude = current.address_longitude;
    if (lonResult.value !== undefined) {
      addressLongitude = lonResult.value;
    }

    if (!firstName) {
      return res.status(400).json({ error: "first_name is required" });
    }
    if (!lastName) {
      return res.status(400).json({ error: "last_name is required" });
    }

    if (!isAllowedOwnerPhotoUrl(ownerId, photoUrl)) {
      return res.status(400).json({
        error: "photo_url must be a /uploads path for this owner, https URL, or small data URL",
      });
    }

    if (!isAllowedOwnerPhotoUrl(ownerId, shopPhotoUrl)) {
      return res.status(400).json({
        error: "shop_photo_url must be a /uploads path for this owner, https URL, or small data URL",
      });
    }

    if (!shopAddress) {
      addressMapUrl = null;
      addressLatitude = null;
      addressLongitude = null;
    }

    const constructorUmResult = parseYandexMapConstructorUm(
      b.yandexMapConstructorUm !== undefined
        ? b.yandexMapConstructorUm
        : b.yandex_map_constructor_um,
    );
    if (constructorUmResult.error) {
      return res.status(400).json({ error: constructorUmResult.error });
    }
    let yandexMapConstructorUm = current.yandex_map_constructor_um;
    if (constructorUmResult.value !== undefined) {
      yandexMapConstructorUm = constructorUmResult.value;
    }

    const dgisEmbedResult = parseDgisMapConstructorEmbed(
      b.dgisMapConstructorEmbed !== undefined
        ? b.dgisMapConstructorEmbed
        : b.dgis_map_constructor_embed,
    );
    if (dgisEmbedResult.error) {
      return res.status(400).json({ error: dgisEmbedResult.error });
    }
    let dgisMapConstructorEmbed = current.dgis_map_constructor_embed;
    if (dgisEmbedResult.value !== undefined) {
      dgisMapConstructorEmbed = dgisEmbedResult.value;
    }

    const result = await pool.query(
      `UPDATE owners
       SET first_name = $2,
           last_name = $3,
           phone = $4,
           photo_url = $5,
           shop_name = $6,
           shop_photo_url = $7,
           description = $8,
           shop_address = $9,
           address_map_provider = $10,
           address_map_url = $11,
           address_latitude = $12,
           address_longitude = $13,
           yandex_map_constructor_um = $14,
           dgis_map_constructor_embed = $15,
           updated_at = now()
       WHERE id = $1
       RETURNING ${OWNER_SHOP_COLUMNS};`,
      [
        ownerId,
        firstName,
        lastName,
        phone,
        photoUrl,
        shopName,
        shopPhotoUrl,
        description,
        shopAddress,
        addressMapProvider,
        addressMapUrl,
        addressLatitude,
        addressLongitude,
        yandexMapConstructorUm,
        dgisMapConstructorEmbed,
      ],
    );

    // Best-effort cleanup: если пользователь заменил/удалил локальный /uploads файл,
    // удалим старый, чтобы не копить мусор.
    const next = result.rows[0];
    const nextPhotoUrl = next.photo_url;
    const nextShopPhotoUrl = next.shop_photo_url;
    if (previousPhotoUrl && previousPhotoUrl !== nextPhotoUrl) {
      void tryDeleteOwnerUploadByPublicPath(ownerId, previousPhotoUrl);
    }
    if (previousShopPhotoUrl && previousShopPhotoUrl !== nextShopPhotoUrl) {
      void tryDeleteOwnerUploadByPublicPath(ownerId, previousShopPhotoUrl);
    }

    return res.json({ owner: mapOwnerRow(next) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getOwnerProfile, updateOwnerProfile };

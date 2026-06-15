const pool = require("../../../db");
const { ensureOwnerSchema } = require("../../../utils/ensureOwnerSchema");
const { isAllowedOwnerPhotoUrl } = require("../../../utils/processImage");
const {
  normalizeOwnerUploadPublicUrl,
  tryDeleteOwnerUploadByPublicPath,
} = require("../../../utils/uploadsPaths");
const {
  listOwnerSpecialOffers,
  parseSpecialOffersPayload,
  assertOwnerOwnsOfferLinks,
  resolveSpecialOfferTargets,
} = require("../../../utils/specialOffers");

async function getOwnerSpecialOffers(req, res) {
  try {
    await ensureOwnerSchema();
    const ownerId = req.user.id;
    const offers = await listOwnerSpecialOffers(ownerId);
    return res.json({ offers });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function replaceOwnerSpecialOffers(req, res) {
  try {
    await ensureOwnerSchema();
    const ownerId = req.user.id;
    const body = req.body || {};
    const parsed = parseSpecialOffersPayload(body.offers);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    if (parsed.value === undefined) {
      return res.status(400).json({ error: "offers array is required" });
    }

    for (const offer of parsed.value) {
      offer.imageUrl = normalizeOwnerUploadPublicUrl(ownerId, offer.imageUrl);
      if (!isAllowedOwnerPhotoUrl(ownerId, offer.imageUrl)) {
        return res.status(400).json({
          error: "imageUrl must be a /uploads path for this owner, https URL, or small data URL",
        });
      }
    }

    const resolved = await resolveSpecialOfferTargets(ownerId, parsed.value);
    if (resolved.error) {
      return res.status(400).json({ error: resolved.error });
    }

    const linkError = await assertOwnerOwnsOfferLinks(ownerId, resolved.value);
    if (linkError) {
      return res.status(400).json({ error: linkError });
    }

    const client = await pool.connect();
    let previousImageUrls = [];
    try {
      await client.query("BEGIN");
      const previous = await client.query(
        `SELECT image_url FROM owner_special_offers WHERE owner_id = $1;`,
        [ownerId],
      );
      previousImageUrls = previous.rows.map((r) => r.image_url).filter(Boolean);
      await client.query(`DELETE FROM owner_special_offers WHERE owner_id = $1;`, [ownerId]);
      for (const offer of resolved.value) {
        const storedImageUrl = normalizeOwnerUploadPublicUrl(ownerId, offer.imageUrl);
        await client.query(
          `INSERT INTO owner_special_offers (owner_id, image_url, link_url, link_item_id, link_event_id, sort_order, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, now());`,
          [ownerId, storedImageUrl, offer.linkUrl, offer.linkItemId, offer.linkEventId, offer.sortOrder],
        );
      }
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    const nextSet = new Set(
      resolved.value.map((o) => normalizeOwnerUploadPublicUrl(ownerId, o.imageUrl)),
    );
    const toDelete = [...new Set(previousImageUrls)]
      .map((url) => normalizeOwnerUploadPublicUrl(ownerId, url))
      .filter((url) => url && !nextSet.has(url));
    for (const url of toDelete) {
      void tryDeleteOwnerUploadByPublicPath(ownerId, url);
    }

    const offers = await listOwnerSpecialOffers(ownerId);
    return res.json({ offers });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getOwnerSpecialOffers,
  replaceOwnerSpecialOffers,
};

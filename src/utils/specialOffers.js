const pool = require("../db");
const { toAbsoluteMediaUrl } = require("./publicUrl");

const MAX_SPECIAL_OFFERS = 6;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseLinkType(raw, linkUrl, linkItemId, linkEventId) {
  if (raw === "none" || raw === "external" || raw === "item" || raw === "event") {
    return raw;
  }
  if (linkItemId) return "item";
  if (linkEventId) return "event";
  if (linkUrl) return "external";
  return "none";
}

function parseSpecialOffersPayload(raw) {
  if (raw === undefined) return { value: undefined };
  if (!Array.isArray(raw)) {
    return { error: "offers must be an array" };
  }
  if (raw.length > MAX_SPECIAL_OFFERS) {
    return { error: `At most ${MAX_SPECIAL_OFFERS} special offers allowed` };
  }

  const offers = [];
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i];
    if (!entry || typeof entry !== "object") {
      return { error: `offers[${i}] must be an object` };
    }
    const imageUrl = String(entry.imageUrl ?? entry.image_url ?? "").trim();
    if (!imageUrl) {
      return { error: `offers[${i}].imageUrl is required` };
    }
    if (imageUrl.length > 512) {
      return { error: `offers[${i}].imageUrl is too long` };
    }

    let linkTarget = entry.linkTarget ?? entry.link_target;
    if (linkTarget !== undefined && linkTarget !== null && String(linkTarget).trim() !== "") {
      offers.push({
        imageUrl,
        linkTarget: String(linkTarget).trim(),
        sortOrder: i,
      });
      continue;
    }

    let linkUrl = entry.linkUrl ?? entry.link_url;
    if (linkUrl === undefined || linkUrl === null || linkUrl === "") {
      linkUrl = null;
    } else {
      linkUrl = String(linkUrl).trim();
    }

    let linkItemId = entry.linkItemId ?? entry.link_item_id;
    if (linkItemId === undefined || linkItemId === null || linkItemId === "") {
      linkItemId = null;
    } else {
      linkItemId = String(linkItemId).trim();
      if (!UUID_RE.test(linkItemId)) {
        return { error: `offers[${i}].linkItemId must be a valid UUID` };
      }
    }

    let linkEventId = entry.linkEventId ?? entry.link_event_id;
    if (linkEventId === undefined || linkEventId === null || linkEventId === "") {
      linkEventId = null;
    } else {
      linkEventId = String(linkEventId).trim();
      if (!UUID_RE.test(linkEventId)) {
        return { error: `offers[${i}].linkEventId must be a valid UUID` };
      }
    }

    const linkType = parseLinkType(
      entry.linkType ?? entry.link_type,
      linkUrl,
      linkItemId,
      linkEventId,
    );

    if (linkType === "external") {
      if (!linkUrl) {
        return { error: `offers[${i}].linkUrl is required when linkType is external` };
      }
      if (linkUrl.length > 2048) {
        return { error: `offers[${i}].linkUrl is too long` };
      }
      if (!/^https?:\/\//i.test(linkUrl)) {
        return { error: `offers[${i}].linkUrl must start with http:// or https://` };
      }
      linkItemId = null;
      linkEventId = null;
    } else if (linkType === "item") {
      if (!linkItemId) {
        return { error: `offers[${i}].linkItemId is required when linkType is item` };
      }
      linkUrl = null;
      linkEventId = null;
    } else if (linkType === "event") {
      if (!linkEventId) {
        return { error: `offers[${i}].linkEventId is required when linkType is event` };
      }
      linkUrl = null;
      linkItemId = null;
    } else {
      linkUrl = null;
      linkItemId = null;
      linkEventId = null;
    }

    offers.push({ imageUrl, linkUrl, linkItemId, linkEventId, sortOrder: i });
  }

  return { value: offers };
}

function mapSpecialOfferRow(row) {
  const linkItemId = row.link_item_id ?? null;
  const linkEventId = row.link_event_id ?? null;
  const linkUrl = row.link_url ?? null;
  let linkType = "none";
  if (linkItemId) linkType = "item";
  else if (linkEventId) linkType = "event";
  else if (linkUrl) linkType = "external";

  return {
    id: row.id,
    imageUrl: row.image_url,
    linkUrl,
    linkItemId,
    linkEventId,
    linkType,
    sortOrder: row.sort_order,
  };
}

async function listOwnerSpecialOffers(ownerId) {
  const result = await pool.query(
    `SELECT id, image_url, link_url, link_item_id, link_event_id, sort_order
     FROM owner_special_offers
     WHERE owner_id = $1
     ORDER BY sort_order ASC, created_at ASC;`,
    [ownerId],
  );
  return result.rows.map((row) => {
    const mapped = mapSpecialOfferRow(row);
    return {
      ...mapped,
      imageUrl: toAbsoluteMediaUrl(mapped.imageUrl),
    };
  });
}

async function assertOwnerOwnsOfferLinks(ownerId, offers, db = pool) {
  const itemIds = [...new Set(offers.map((o) => o.linkItemId).filter(Boolean))];
  if (itemIds.length > 0) {
    const items = await db.query(
      `SELECT id::text AS id FROM items WHERE owner_id = $1 AND id = ANY($2::uuid[]);`,
      [ownerId, itemIds],
    );
    if (items.rowCount !== itemIds.length) {
      const found = new Set(items.rows.map((r) => String(r.id).toLowerCase()));
      const missing = itemIds.filter((id) => !found.has(String(id).toLowerCase()));

      const asEvents = await db.query(
        `SELECT id::text AS id FROM events WHERE owner_id = $1 AND id = ANY($2::uuid[]);`,
        [ownerId, missing],
      );
      if (asEvents.rowCount > 0) {
        return "Код указан в поле «вещь», но это ID события. Вставьте его в поле «Код события».";
      }

      const otherOwner = await db.query(
        `SELECT id::text AS id FROM items WHERE id = ANY($1::uuid[]) AND owner_id <> $2 LIMIT 1;`,
        [missing, ownerId],
      );
      if (otherOwner.rowCount > 0) {
        return "Код вещи не принадлежит вашему магазину. Скопируйте ID из раздела «Вещи» текущего аккаунта.";
      }

      return `Вещь с кодом ${missing[0]} не найдена (возможно, удалена). Очистите поле или укажите другой код.`;
    }
  }

  const eventIds = [...new Set(offers.map((o) => o.linkEventId).filter(Boolean))];
  if (eventIds.length > 0) {
    const events = await db.query(
      `SELECT id::text AS id FROM events WHERE owner_id = $1 AND id = ANY($2::uuid[]);`,
      [ownerId, eventIds],
    );
    if (events.rowCount !== eventIds.length) {
      const found = new Set(events.rows.map((r) => String(r.id).toLowerCase()));
      const missing = eventIds.filter((id) => !found.has(String(id).toLowerCase()));

      const asItems = await db.query(
        `SELECT id::text AS id FROM items WHERE owner_id = $1 AND id = ANY($2::uuid[]);`,
        [ownerId, missing],
      );
      if (asItems.rowCount > 0) {
        return "Код указан в поле «событие», но это ID вещи. Вставьте его в поле «Код вещи».";
      }

      const otherOwner = await db.query(
        `SELECT id::text AS id FROM events WHERE id = ANY($1::uuid[]) AND owner_id <> $2 LIMIT 1;`,
        [missing, ownerId],
      );
      if (otherOwner.rowCount > 0) {
        return "Код события не принадлежит вашему магазину. Скопируйте ID из раздела «События» текущего аккаунта.";
      }

      return `Событие с кодом ${missing[0]} не найдено (возможно, удалено). Очистите поле или укажите другой код.`;
    }
  }

  return null;
}

async function resolveSpecialOfferTargets(ownerId, offers, db = pool) {
  const resolved = [];

  for (let i = 0; i < offers.length; i += 1) {
    const offer = offers[i];
    const bannerNo = i + 1;
    const raw = offer.linkTarget?.trim() ?? "";

    if (raw) {
      if (/^https?:\/\//i.test(raw)) {
        if (raw.length > 2048) {
          return { error: `Баннер ${bannerNo}: ссылка слишком длинная` };
        }
        resolved.push({
          imageUrl: offer.imageUrl,
          linkUrl: raw,
          linkItemId: null,
          linkEventId: null,
          sortOrder: offer.sortOrder,
        });
        continue;
      }

      if (!UUID_RE.test(raw)) {
        return {
          error: `Баннер ${bannerNo}: укажите UUID вещи/события или ссылку https://…`,
        };
      }

      const itemRes = await db.query(
        `SELECT id::text AS id FROM items WHERE owner_id = $1 AND id = $2::uuid;`,
        [ownerId, raw],
      );
      if (itemRes.rowCount > 0) {
        resolved.push({
          imageUrl: offer.imageUrl,
          linkItemId: raw,
          linkEventId: null,
          linkUrl: null,
          sortOrder: offer.sortOrder,
        });
        continue;
      }

      const eventRes = await db.query(
        `SELECT id::text AS id FROM events WHERE owner_id = $1 AND id = $2::uuid;`,
        [ownerId, raw],
      );
      if (eventRes.rowCount > 0) {
        resolved.push({
          imageUrl: offer.imageUrl,
          linkEventId: raw,
          linkItemId: null,
          linkUrl: null,
          sortOrder: offer.sortOrder,
        });
        continue;
      }

      const otherItem = await db.query(
        `SELECT id::text AS id FROM items WHERE id = $1::uuid AND owner_id <> $2 LIMIT 1;`,
        [raw, ownerId],
      );
      if (otherItem.rowCount > 0) {
        return {
          error: `Баннер ${bannerNo}: код не принадлежит вашему магазину. Скопируйте ID из «Вещи» или «События».`,
        };
      }

      const otherEvent = await db.query(
        `SELECT id::text AS id FROM events WHERE id = $1::uuid AND owner_id <> $2 LIMIT 1;`,
        [raw, ownerId],
      );
      if (otherEvent.rowCount > 0) {
        return {
          error: `Баннер ${bannerNo}: код не принадлежит вашему магазину. Скопируйте ID из «Вещи» или «События».`,
        };
      }

      return {
        error: `Баннер ${bannerNo}: карточка с таким кодом не найдена (возможно, удалена).`,
      };
    }

    resolved.push({
      imageUrl: offer.imageUrl,
      linkUrl: offer.linkUrl ?? null,
      linkItemId: offer.linkItemId ?? null,
      linkEventId: offer.linkEventId ?? null,
      sortOrder: offer.sortOrder,
    });
  }

  return { value: resolved };
}

module.exports = {
  MAX_SPECIAL_OFFERS,
  parseSpecialOffersPayload,
  mapSpecialOfferRow,
  listOwnerSpecialOffers,
  assertOwnerOwnsOfferLinks,
  resolveSpecialOfferTargets,
};

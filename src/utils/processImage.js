const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");
const sharp = require("sharp");
const {
  ensureOwnerUploadDir,
  toPublicUploadPath,
} = require("./uploadsPaths");

const MAX_INPUT_BYTES = Number(process.env.UPLOAD_MAX_INPUT_BYTES) || 15 * 1024 * 1024;
const MAX_OUTPUT_EDGE = Number(process.env.UPLOAD_MAX_EDGE) || 1600;
const WEBP_QUALITY = Number(process.env.UPLOAD_WEBP_QUALITY) || 80;
/** VK promo carousel layout size (CSS px). */
const PROMO_CARD_WIDTH = 315;
const PROMO_CARD_HEIGHT = 130;
/** Export at 2× for sharp rendering on Retina / high-DPI phones. */
const PROMO_PIXEL_RATIO = Number(process.env.PROMO_PIXEL_RATIO) || 2;
const PROMO_EXPORT_WIDTH = PROMO_CARD_WIDTH * PROMO_PIXEL_RATIO;
const PROMO_EXPORT_HEIGHT = PROMO_CARD_HEIGHT * PROMO_PIXEL_RATIO;
const PROMO_WEBP_QUALITY = Number(process.env.PROMO_WEBP_QUALITY) || 90;
/** VK catalog card layout (mock-tile) — must match Frontend_admin catalogImageCrop.ts */
const CATALOG_CARD_WIDTH = 160;
const CATALOG_CARD_HEIGHT = 220;
const CATALOG_EXPORT_WIDTH = CATALOG_CARD_WIDTH * PROMO_PIXEL_RATIO;
const CATALOG_EXPORT_HEIGHT = CATALOG_CARD_HEIGHT * PROMO_PIXEL_RATIO;
const CATALOG_WEBP_QUALITY = Number(process.env.CATALOG_WEBP_QUALITY) || 88;

async function processAndSaveOwnerImage(ownerId, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw Object.assign(new Error("Empty image buffer"), { status: 400 });
  }
  if (buffer.length > MAX_INPUT_BYTES) {
    throw Object.assign(new Error(`File too large (max ${Math.round(MAX_INPUT_BYTES / 1024 / 1024)}MB)`), {
      status: 400,
    });
  }

  try {
    const metadata = await sharp(buffer, { failOn: "error" }).metadata();
    if (!metadata.width || !metadata.height) {
      throw Object.assign(new Error("Unsupported or corrupted image"), { status: 400 });
    }
  } catch (err) {
    if (err.status) throw err;
    throw Object.assign(new Error("Unsupported or corrupted image"), { status: 400 });
  }

  const { data, info } = await sharp(buffer, { failOn: "error" })
    .rotate()
    .resize({
      width: MAX_OUTPUT_EDGE,
      height: MAX_OUTPUT_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });

  const filename = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.webp`;
  const dir = ensureOwnerUploadDir(ownerId);
  const absolutePath = path.join(dir, filename);
  await fs.writeFile(absolutePath, data);

  return {
    url: toPublicUploadPath(ownerId, filename),
    absolutePath,
    width: info.width,
    height: info.height,
    size: data.length,
    format: "webp",
  };
}

function isAllowedOwnerPhotoUrl(ownerId, url) {
  if (!url || typeof url !== "string") return true;
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("data:")) return trimmed.length <= 2_000_000;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.length <= 2048;
  }
  const prefix = `/uploads/${ownerId}/`;
  return trimmed.startsWith(prefix) && trimmed.length <= 512 && !trimmed.includes("..");
}

async function processAndSaveOwnerPromoImage(ownerId, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw Object.assign(new Error("Empty image buffer"), { status: 400 });
  }
  if (buffer.length > MAX_INPUT_BYTES) {
    throw Object.assign(new Error(`File too large (max ${Math.round(MAX_INPUT_BYTES / 1024 / 1024)}MB)`), {
      status: 400,
    });
  }

  try {
    const metadata = await sharp(buffer, { failOn: "error" }).metadata();
    if (!metadata.width || !metadata.height) {
      throw Object.assign(new Error("Unsupported or corrupted image"), { status: 400 });
    }
  } catch (err) {
    if (err.status) throw err;
    throw Object.assign(new Error("Unsupported or corrupted image"), { status: 400 });
  }

  const meta = await sharp(buffer, { failOn: "error" }).rotate().metadata();
  const alreadyPromoSize =
    meta.width === PROMO_EXPORT_WIDTH && meta.height === PROMO_EXPORT_HEIGHT;

  let pipeline = sharp(buffer, { failOn: "error" }).rotate();
  if (!alreadyPromoSize) {
    pipeline = pipeline.resize(PROMO_EXPORT_WIDTH, PROMO_EXPORT_HEIGHT, {
      fit: "cover",
      position: "centre",
      kernel: sharp.kernel.lanczos3,
    });
  }

  const { data, info } = await pipeline
    .webp({ quality: PROMO_WEBP_QUALITY, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  const filename = `promo-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.webp`;
  const dir = ensureOwnerUploadDir(ownerId);
  const absolutePath = path.join(dir, filename);
  await fs.writeFile(absolutePath, data);

  return {
    url: toPublicUploadPath(ownerId, filename),
    absolutePath,
    width: info.width,
    height: info.height,
    size: data.length,
    format: "webp",
  };
}

async function processAndSaveOwnerCatalogImage(ownerId, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw Object.assign(new Error("Empty image buffer"), { status: 400 });
  }
  if (buffer.length > MAX_INPUT_BYTES) {
    throw Object.assign(new Error(`File too large (max ${Math.round(MAX_INPUT_BYTES / 1024 / 1024)}MB)`), {
      status: 400,
    });
  }

  try {
    const metadata = await sharp(buffer, { failOn: "error" }).metadata();
    if (!metadata.width || !metadata.height) {
      throw Object.assign(new Error("Unsupported or corrupted image"), { status: 400 });
    }
  } catch (err) {
    if (err.status) throw err;
    throw Object.assign(new Error("Unsupported or corrupted image"), { status: 400 });
  }

  const { data, info } = await sharp(buffer, { failOn: "error" })
    .rotate()
    .resize(CATALOG_EXPORT_WIDTH, CATALOG_EXPORT_HEIGHT, {
      fit: "inside",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3,
    })
    .webp({ quality: CATALOG_WEBP_QUALITY, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  const filename = `catalog-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.webp`;
  const dir = ensureOwnerUploadDir(ownerId);
  const absolutePath = path.join(dir, filename);
  await fs.writeFile(absolutePath, data);

  return {
    url: toPublicUploadPath(ownerId, filename),
    absolutePath,
    width: info.width,
    height: info.height,
    size: data.length,
    format: "webp",
  };
}

module.exports = {
  MAX_INPUT_BYTES,
  PROMO_CARD_WIDTH,
  PROMO_CARD_HEIGHT,
  PROMO_EXPORT_WIDTH,
  PROMO_EXPORT_HEIGHT,
  CATALOG_CARD_WIDTH,
  CATALOG_CARD_HEIGHT,
  CATALOG_EXPORT_WIDTH,
  CATALOG_EXPORT_HEIGHT,
  processAndSaveOwnerImage,
  processAndSaveOwnerPromoImage,
  processAndSaveOwnerCatalogImage,
  isAllowedOwnerPhotoUrl,
};

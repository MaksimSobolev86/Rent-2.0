const fs = require("fs");
const path = require("path");

const UPLOADS_ROOT = path.resolve(
  process.cwd(),
  process.env.UPLOADS_DIR || "uploads",
);

function isUuidLike(value) {
  return /^[0-9a-f-]{36}$/i.test(String(value).trim());
}

function getOwnerUploadDir(ownerId) {
  const safeOwnerId = String(ownerId).trim();
  if (!isUuidLike(safeOwnerId)) {
    throw new Error("Invalid owner id");
  }
  return path.join(UPLOADS_ROOT, safeOwnerId);
}

function ensureUploadsRoot() {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
}

function ensureOwnerUploadDir(ownerId) {
  ensureUploadsRoot();
  const dir = getOwnerUploadDir(ownerId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function toPublicUploadPath(ownerId, filename) {
  return `/uploads/${ownerId}/${filename}`;
}

/** Store only `/uploads/<ownerId>/...` in DB; strip origin from absolute re-saves. */
function normalizeOwnerUploadPublicUrl(ownerId, url) {
  if (!url || typeof url !== "string") return url;
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  const safeOwnerId = String(ownerId).trim();
  const prefix = `/uploads/${safeOwnerId}/`;
  if (trimmed.startsWith(prefix)) return trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const pathname = new URL(trimmed).pathname;
      if (pathname.startsWith(prefix)) return pathname;
    } catch {
      /* keep external https URLs as-is */
    }
  }

  return trimmed;
}

/**
 * Best-effort удаление файла из uploads по публичному пути.
 * Удаляем ТОЛЬКО если это строгий local-путь вида /uploads/<ownerId>/...
 */
async function tryDeleteOwnerUploadByPublicPath(ownerId, publicPath) {
  try {
    const safeOwnerId = String(ownerId).trim();
    if (!isUuidLike(safeOwnerId)) return false;
    if (!publicPath || typeof publicPath !== "string") return false;
    if (!publicPath.startsWith(`/uploads/${safeOwnerId}/`)) return false;

    const relativePart = publicPath.slice(`/uploads/${safeOwnerId}/`.length);
    if (!relativePart || relativePart.includes("..") || relativePart.includes("\\") || relativePart.includes("\0")) {
      return false;
    }

    const absolutePath = path.resolve(getOwnerUploadDir(safeOwnerId), relativePart);
    const ownerDir = getOwnerUploadDir(safeOwnerId);
    if (!absolutePath.startsWith(ownerDir + path.sep) && absolutePath !== ownerDir) {
      return false;
    }

    await fs.promises.unlink(absolutePath);
    return true;
  } catch (err) {
    // ignore: file may not exist or cannot be deleted
    return false;
  }
}

module.exports = {
  UPLOADS_ROOT,
  getOwnerUploadDir,
  ensureUploadsRoot,
  ensureOwnerUploadDir,
  toPublicUploadPath,
  normalizeOwnerUploadPublicUrl,
  tryDeleteOwnerUploadByPublicPath,
};

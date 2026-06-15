const OWNER_LIKE_ROLES = new Set(["owner", "admin"]);

function isOwnerLikeRole(req) {
  const role = String(req.user?.role ?? "").toLowerCase();
  return OWNER_LIKE_ROLES.has(role);
}

function isUuid(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Authenticated owner panel: scope all queries to this id. */
function getScopedOwnerId(req) {
  if (!isOwnerLikeRole(req)) return null;
  return req.user?.id ?? null;
}

/** VK / public catalog: ownerId from query string. */
function getQueryOwnerId(req) {
  const raw = req.query?.ownerId ?? req.query?.owner_id;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isUuid(value) ? value : null;
}

/**
 * Owner id for public catalog routes:
 * logged-in owner wins; otherwise ?ownerId= is required.
 */
function resolveCatalogOwnerId(req) {
  const scoped = getScopedOwnerId(req);
  if (scoped) return scoped;
  return getQueryOwnerId(req);
}

function requireScopedOwnerId(req, res) {
  const ownerId = getScopedOwnerId(req);
  if (!ownerId) {
    res.status(401).json({ error: "Owner authentication required" });
    return null;
  }
  return ownerId;
}

module.exports = {
  isOwnerLikeRole,
  isUuid,
  getScopedOwnerId,
  getQueryOwnerId,
  resolveCatalogOwnerId,
  requireScopedOwnerId,
};

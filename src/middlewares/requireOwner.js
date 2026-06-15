const OWNER_LIKE_ROLES = new Set(["owner", "admin"]);
const { isUuid } = require("../utils/ownerScope");

function requireOwner(req, res, next) {
  const { id, role } = req.user || {};
  if (!id || !isUuid(id)) {
    return res
      .status(401)
      .json({ error: "Owner authentication required" });
  }
  const normalized = String(role ?? "").toLowerCase();
  if (!OWNER_LIKE_ROLES.has(normalized)) {
    return res.status(403).json({ error: "Owner or admin role required" });
  }
  next();
}

module.exports = { requireOwner };


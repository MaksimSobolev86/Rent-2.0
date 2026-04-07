function requireOwner(req, res, next) {
  const { id, role } = req.user || {};
  if (!id) {
    return res
      .status(400)
      .json({ error: "Missing x-user-id (mock auth)" });
  }
  if (role !== "owner") {
    return res.status(403).json({ error: "Owner role required" });
  }
  next();
}

module.exports = { requireOwner };


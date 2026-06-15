const { verifyOwnerSession } = require("../utils/sessionToken");

function mockAuth(req, res, next) {
  const authHeader = req.header("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (bearer) {
    const user = verifyOwnerSession(bearer);
    if (!user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    return next();
  }

  const allowMockHeaders =
    process.env.ALLOW_MOCK_AUTH === "true" || process.env.NODE_ENV !== "production";

  if (allowMockHeaders) {
    const id = req.header("x-user-id") || null;
    const role = req.header("x-user-role") || null;
    req.user = { id, role };
    return next();
  }

  req.user = { id: null, role: null };
  next();
}

module.exports = { mockAuth };


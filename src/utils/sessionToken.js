const crypto = require("crypto");

const DEFAULT_TTL_SEC = 7 * 24 * 60 * 60;

function getSecret() {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || "dev-insecure-change-me";
}

function signOwnerSession(ownerId, role = "owner") {
  const payload = {
    sub: ownerId,
    role,
    exp: Math.floor(Date.now() / 1000) + DEFAULT_TTL_SEC,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyOwnerSession(token) {
  if (!token || typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = crypto.createHmac("sha256", getSecret()).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  if (!payload.sub) return null;
  return { id: payload.sub, role: payload.role || "owner" };
}

module.exports = { signOwnerSession, verifyOwnerSession };

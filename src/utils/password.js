const { randomBytes, timingSafeEqual, scryptSync } = require("crypto");

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== "string") return false;
  const [algo, salt, hash] = storedHash.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const checkHash = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(checkHash, "hex"));
}

module.exports = { hashPassword, verifyPassword };

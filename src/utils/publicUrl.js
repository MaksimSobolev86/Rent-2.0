function getPublicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
}

function toAbsoluteMediaUrl(url) {
  if (!url || typeof url !== "string") return url;
  const trimmed = url.trim();
  if (!trimmed.startsWith("/uploads/")) return trimmed;
  const base = getPublicBaseUrl();
  return base ? `${base}${trimmed}` : trimmed;
}

module.exports = { getPublicBaseUrl, toAbsoluteMediaUrl };

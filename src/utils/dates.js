function parseISODateOnly(value) {
  if (typeof value !== "string") return null;
  // Expect YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  // Validate that date didn't overflow (e.g. 2026-02-31)
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d;
}

function toTime(d) {
  return d instanceof Date ? d.getTime() : NaN;
}

module.exports = { parseISODateOnly, toTime };


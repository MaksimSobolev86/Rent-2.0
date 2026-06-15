/**
 * Money helpers: prices are stored in rubles with 2 decimal places.
 * Calculations use integer kopecks to avoid 4999.999999 artifacts.
 */

function toKopecks(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function fromKopecks(kopecks) {
  return Math.round(kopecks) / 100;
}

function roundMoney(value) {
  return fromKopecks(toKopecks(value));
}

/** Split a period price (week/month) into an equal daily rate. */
function divideMoney(amount, divisor) {
  const parts = Number(divisor);
  if (!Number.isFinite(parts) || parts <= 0) return 0;
  return fromKopecks(Math.round(toKopecks(amount) / parts));
}

function addMoney(...amounts) {
  const sumKopecks = amounts.reduce((sum, amount) => sum + toKopecks(amount), 0);
  return fromKopecks(sumKopecks);
}

function multiplyMoney(amount, factor) {
  const n = Number(factor);
  if (!Number.isFinite(n)) return 0;
  return fromKopecks(Math.round(toKopecks(amount) * n));
}

module.exports = {
  toKopecks,
  fromKopecks,
  roundMoney,
  divideMoney,
  addMoney,
  multiplyMoney,
};

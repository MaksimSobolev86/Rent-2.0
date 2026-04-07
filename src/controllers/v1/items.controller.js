const { db } = require("../../models/db");
const { parseISODateOnly, toTime } = require("../../utils/dates");
const { overlaps } = require("../../utils/bookingOverlap");

function listItems(req, res) {
  const items = db.items.filter((i) => !i.isHidden);
  res.json({ items });
}

function getItemAvailability(req, res) {
  const { itemId } = req.params;
  const dateFrom = parseISODateOnly(req.query.dateFrom);
  const dateTo = parseISODateOnly(req.query.dateTo);

  if (!dateFrom || !dateTo) {
    return res
      .status(400)
      .json({ error: "dateFrom and dateTo must be YYYY-MM-DD" });
  }
  if (toTime(dateFrom) >= toTime(dateTo)) {
    return res.status(400).json({ error: "dateFrom must be < dateTo" });
  }

  const item = db.items.find((i) => i.id === itemId);
  if (!item || item.isHidden) {
    return res.status(404).json({ error: "Item not found" });
  }

  const newFrom = toTime(dateFrom);
  const newTo = toTime(dateTo);

  const conflicts = db.bookings.filter((b) => {
    if (b.itemId !== itemId) return false;
    if (b.status !== "pending" && b.status !== "approved") return false;
    return overlaps(toTime(b.dateFrom), toTime(b.dateTo), newFrom, newTo);
  });

  res.json({
    available: conflicts.length === 0,
    conflicts: conflicts.map((b) => b.id),
  });
}

module.exports = { listItems, getItemAvailability };


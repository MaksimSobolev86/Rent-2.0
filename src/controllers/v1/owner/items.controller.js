const { randomUUID } = require("crypto");

const { db } = require("../../../models/db");

function createOwnerItem(req, res) {
  const ownerId = req.user.id;
  const { title, description, price } = req.body || {};

  if (!title) return res.status(400).json({ error: "title is required" });
  if (price == null || Number.isNaN(Number(price))) {
    return res.status(400).json({ error: "price must be a number" });
  }

  const item = {
    id: randomUUID(),
    ownerId,
    title: String(title),
    description: description != null ? String(description) : "",
    price: Number(price),
    isHidden: false,
    createdAt: new Date(),
  };

  db.items.push(item);
  return res.status(201).json({ item });
}

function updateOwnerItem(req, res) {
  const ownerId = req.user.id;
  const { itemId } = req.params;
  const item = db.items.find((i) => i.id === itemId);
  if (!item) return res.status(404).json({ error: "Item not found" });
  if (item.ownerId !== ownerId) {
    return res.status(403).json({ error: "Not your item" });
  }

  const { title, description, price, isHidden } = req.body || {};

  if (title != null) item.title = String(title);
  if (description != null) item.description = String(description);
  if (price != null) {
    if (Number.isNaN(Number(price))) {
      return res.status(400).json({ error: "price must be a number" });
    }
    item.price = Number(price);
  }
  if (isHidden != null) item.isHidden = Boolean(isHidden);

  return res.json({ item });
}

function hideOwnerItem(req, res) {
  const ownerId = req.user.id;
  const { itemId } = req.params;
  const item = db.items.find((i) => i.id === itemId);
  if (!item) return res.status(404).json({ error: "Item not found" });
  if (item.ownerId !== ownerId) {
    return res.status(403).json({ error: "Not your item" });
  }
  item.isHidden = true;
  return res.json({ itemId: item.id, isHidden: true });
}

module.exports = { createOwnerItem, updateOwnerItem, hideOwnerItem };


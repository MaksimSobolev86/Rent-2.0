const { Router } = require("express");
const { requireOwner } = require("../../middlewares/requireOwner");
const {
  listItems,
  getItemById,
  createItem,
  updateItem,
  getItemAvailability,
  getItemRentalPrice,
} = require("../../controllers/v1/items.controller");

const router = Router();

router.get("/", listItems);
router.get("/:itemId", getItemById);
router.get("/:itemId/availability", getItemAvailability);
router.get("/:itemId/rental-price", getItemRentalPrice);
router.post("/", requireOwner, createItem);
router.patch("/:itemId", requireOwner, updateItem);

module.exports = router;


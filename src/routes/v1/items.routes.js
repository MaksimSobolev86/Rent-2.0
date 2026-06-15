const { Router } = require("express");
const { requireOwner } = require("../../middlewares/requireOwner");
const {
  listItems,
  listCatalogItemGroups,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  getItemAvailability,
  getItemBookedSlots,
  getItemRentalPrice,
} = require("../../controllers/v1/items.controller");

const router = Router();

router.get("/", listItems);
router.get("/groups", listCatalogItemGroups);
router.get("/:itemId", getItemById);
router.get("/:itemId/availability", getItemAvailability);
router.get("/:itemId/booked-slots", getItemBookedSlots);
router.get("/:itemId/rental-price", getItemRentalPrice);
router.post("/", requireOwner, createItem);
router.patch("/:itemId", requireOwner, updateItem);
router.delete("/:itemId", requireOwner, deleteItem);

module.exports = router;


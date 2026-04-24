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
router.use(requireOwner);

router.get("/", listItems);
router.post("/", createItem);
router.get("/:itemId", getItemById);
router.patch("/:itemId", updateItem);
router.get("/:itemId/availability", getItemAvailability);
router.get("/:itemId/rental-price", getItemRentalPrice);

module.exports = router;


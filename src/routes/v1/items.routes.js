const { Router } = require("express");
const {
  listItems,
  getItemAvailability,
} = require("../../controllers/v1/items.controller");

const router = Router();

router.get("/", listItems);
router.get("/:itemId/availability", getItemAvailability);

module.exports = router;


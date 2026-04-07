const { Router } = require("express");

const { requireOwner } = require("../../../middlewares/requireOwner");
const {
  createOwnerItem,
  updateOwnerItem,
  hideOwnerItem,
} = require("../../../controllers/v1/owner/items.controller");

const router = Router();

router.use(requireOwner);

router.post("/", createOwnerItem);
router.patch("/:itemId", updateOwnerItem);
router.patch("/:itemId/hide", hideOwnerItem);

module.exports = router;


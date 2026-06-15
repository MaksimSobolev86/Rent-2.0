const { Router } = require("express");

const { requireOwner } = require("../../../middlewares/requireOwner");
const {
  listOwnerItems,
  getOwnerItemById,
  createOwnerItem,
  updateOwnerItem,
  hideOwnerItem,
  deleteOwnerItem,
} = require("../../../controllers/v1/owner/items.controller");

const router = Router();

router.use(requireOwner);

router.get("/", listOwnerItems);
router.get("/:itemId", getOwnerItemById);
router.post("/", createOwnerItem);
router.patch("/:itemId/hide", hideOwnerItem);
router.patch("/:itemId", updateOwnerItem);
router.delete("/:itemId", deleteOwnerItem);

module.exports = router;


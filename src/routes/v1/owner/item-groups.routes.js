const { Router } = require("express");

const { requireOwner } = require("../../../middlewares/requireOwner");
const {
  listOwnerItemGroups,
  createOwnerItemGroup,
  updateOwnerItemGroup,
  deleteOwnerItemGroup,
} = require("../../../controllers/v1/owner/itemGroups.controller");

const router = Router();

router.use(requireOwner);

router.get("/", listOwnerItemGroups);
router.post("/", createOwnerItemGroup);
router.patch("/:groupId", updateOwnerItemGroup);
router.delete("/:groupId", deleteOwnerItemGroup);

module.exports = router;

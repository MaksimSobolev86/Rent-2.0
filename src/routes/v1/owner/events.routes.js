const { Router } = require("express");

const { requireOwner } = require("../../../middlewares/requireOwner");
const {
  createOwnerEvent,
  updateOwnerEvent,
  listOwnerEvents,
  getOwnerEvent,
  publishOwnerEvent,
  cancelOwnerEvent,
  moveOwnerEventToDraft,
  deleteOwnerEvent,
} = require("../../../controllers/v1/owner/events.controller");

const router = Router();

router.use(requireOwner);

router.post("/", createOwnerEvent);
router.patch("/:id", updateOwnerEvent);
router.get("/", listOwnerEvents);
router.get("/:id", getOwnerEvent);
router.post("/:id/publish", publishOwnerEvent);
router.post("/:id/cancel", cancelOwnerEvent);
router.post("/:id/draft", moveOwnerEventToDraft);
router.delete("/:id", deleteOwnerEvent);

module.exports = router;

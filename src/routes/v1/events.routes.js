const { Router } = require("express");
const { listEvents, getEventById, registerForEvent } = require("../../controllers/v1/events.controller");

const router = Router();

router.get("/", listEvents);
router.get("/:eventId", getEventById);
router.post("/:eventId/register", registerForEvent);

module.exports = router;

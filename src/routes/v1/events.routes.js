const { Router } = require("express");
const { getEventById } = require("../../controllers/v1/events.controller");

const router = Router();

router.get("/:eventId", getEventById);

module.exports = router;

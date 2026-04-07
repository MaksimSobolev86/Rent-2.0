const { Router } = require("express");
const { listMyBookings } = require("../../controllers/v1/me.controller");

const router = Router();

router.get("/bookings", listMyBookings);

module.exports = router;


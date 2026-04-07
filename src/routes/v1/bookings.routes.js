const { Router } = require("express");
const {
  createBooking,
  cancelMyBooking,
} = require("../../controllers/v1/bookings.controller");

const router = Router();

router.post("/", createBooking);
router.patch("/:bookingId/cancel", cancelMyBooking);

module.exports = router;


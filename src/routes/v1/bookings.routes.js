const { Router } = require("express");
const {
  createBooking,
  cancelMyBooking,
  listBookings,
} = require("../../controllers/v1/bookings.controller");

const router = Router();

router.get("/", listBookings);
router.post("/", createBooking);
router.patch("/:bookingId/cancel", cancelMyBooking);

module.exports = router;


const { Router } = require("express");
const { requireOwner } = require("../../middlewares/requireOwner");
const {
  createBooking,
  cancelMyBooking,
  listBookings,
} = require("../../controllers/v1/bookings.controller");

const router = Router();
router.use(requireOwner);

router.get("/", listBookings);
router.post("/", createBooking);
router.patch("/:bookingId/cancel", cancelMyBooking);

module.exports = router;


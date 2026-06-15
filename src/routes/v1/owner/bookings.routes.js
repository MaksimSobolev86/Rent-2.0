const { Router } = require("express");

const { requireOwner } = require("../../../middlewares/requireOwner");
const {
  listOwnerBookings,
  confirmOwnerBooking,
  cancelOwnerBooking,
} = require("../../../controllers/v1/owner/bookings.controller");

const router = Router();

router.use(requireOwner);

router.get("/", listOwnerBookings);
router.post("/:bookingId/confirm", confirmOwnerBooking);
router.post("/:bookingId/cancel", cancelOwnerBooking);
router.patch("/:bookingId/approve", confirmOwnerBooking);
router.patch("/:bookingId/cancel", cancelOwnerBooking);

module.exports = router;


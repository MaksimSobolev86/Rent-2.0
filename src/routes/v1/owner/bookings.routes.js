const { Router } = require("express");

const { requireOwner } = require("../../../middlewares/requireOwner");
const {
  listOwnerBookings,
  approveOwnerBooking,
  cancelOwnerBooking,
} = require("../../../controllers/v1/owner/bookings.controller");

const router = Router();

router.use(requireOwner);

router.get("/", listOwnerBookings);
router.patch("/:bookingId/approve", approveOwnerBooking);
router.patch("/:bookingId/cancel", cancelOwnerBooking);

module.exports = router;


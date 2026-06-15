const { Router } = require("express");
const { requireOwner } = require("../../middlewares/requireOwner");
const {
  createBooking,
  quoteRentBooking,
  createRentBooking,
  createSaleBooking,
  cancelMyBooking,
  listBookings,
} = require("../../controllers/v1/bookings.controller");

const router = Router();

router.post("/rent/quote", quoteRentBooking);
router.post("/rent", createRentBooking);
router.post("/sale", createSaleBooking);
router.get("/", requireOwner, listBookings);
router.post("/", requireOwner, createBooking);
router.patch("/:bookingId/cancel", requireOwner, cancelMyBooking);

module.exports = router;


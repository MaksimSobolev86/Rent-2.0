const { Router } = require("express");

const { mockAuth } = require("../../middlewares/mockAuth");
const itemsRoutes = require("./items.routes");
const bookingsRoutes = require("./bookings.routes");
const meRoutes = require("./me.routes");
const ownerItemsRoutes = require("./owner/items.routes");
const ownerBookingsRoutes = require("./owner/bookings.routes");

const router = Router();

router.use(mockAuth);

router.use("/items", itemsRoutes);
router.use("/bookings", bookingsRoutes);
router.use("/me", meRoutes);

router.use("/owner/items", ownerItemsRoutes);
router.use("/owner/bookings", ownerBookingsRoutes);

module.exports = router;


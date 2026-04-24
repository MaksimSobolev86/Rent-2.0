const { Router } = require("express");

const { mockAuth } = require("../../middlewares/mockAuth");
const clientsRoutes = require("./clients.routes");
const itemsRoutes = require("./items.routes");
const bookingsRoutes = require("./bookings.routes");
const meRoutes = require("./me.routes");
const ownersRoutes = require("./owners.routes");
const authRoutes = require("./auth.routes");
const ownerItemsRoutes = require("./owner/items.routes");
const ownerBookingsRoutes = require("./owner/bookings.routes");
const ownerSettingsRoutes = require("./owner/settings.routes");

const router = Router();

router.use(mockAuth);

router.use("/clients", clientsRoutes);
router.use("/items", itemsRoutes);
router.use("/bookings", bookingsRoutes);
router.use("/me", meRoutes);
router.use("/owners", ownersRoutes);
router.use("/auth", authRoutes);

router.use("/owner/items", ownerItemsRoutes);
router.use("/owner/bookings", ownerBookingsRoutes);
router.use("/owner", ownerSettingsRoutes);

module.exports = router;


const { Router } = require("express");
const { requireOwner } = require("../../middlewares/requireOwner");

const {
  createClient,
  listClients,
  getClientById,
  listClientItems,
  listClientBookings,
  updateClient,
  deleteClient,
} = require("../../controllers/v1/clients.controller");

const router = Router();
router.use(requireOwner);

router.get("/", listClients);
router.post("/", createClient);
router.get("/:clientId", getClientById);
router.get("/:clientId/items", listClientItems);
router.get("/:clientId/bookings", listClientBookings);
router.put("/:clientId", updateClient);
router.delete("/:clientId", deleteClient);

module.exports = router;


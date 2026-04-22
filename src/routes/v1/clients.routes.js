const { Router } = require("express");

const {
  createClient,
  listClients,
} = require("../../controllers/v1/clients.controller");

const router = Router();

router.get("/", listClients);
router.post("/", createClient);

module.exports = router;


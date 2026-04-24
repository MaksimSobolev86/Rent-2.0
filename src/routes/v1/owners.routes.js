const { Router } = require("express");
const { listOwners } = require("../../controllers/v1/owners.controller");

const router = Router();

router.get("/", listOwners);

module.exports = router;

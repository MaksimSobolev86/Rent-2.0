const { Router } = require("express");
const { requireOwner } = require("../../middlewares/requireOwner");
const { listOwners } = require("../../controllers/v1/owners.controller");

const router = Router();

router.get("/", requireOwner, listOwners);

module.exports = router;

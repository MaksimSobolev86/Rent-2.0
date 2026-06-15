const { Router } = require("express");
const { getShopProfile } = require("../../controllers/v1/shops.controller");

const router = Router();

router.get("/", getShopProfile);

module.exports = router;

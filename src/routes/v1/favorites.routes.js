const { Router } = require("express");
const { listFavorites, toggleFavorite } = require("../../controllers/v1/favorites.controller");

const router = Router();

router.get("/", listFavorites);
router.post("/toggle", toggleFavorite);

module.exports = router;

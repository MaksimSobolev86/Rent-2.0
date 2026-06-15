const { Router } = require("express");
const { requireOwner } = require("../../../middlewares/requireOwner");
const {
  listOwnerHolidays,
  upsertOwnerHoliday,
  deleteOwnerHoliday,
  listOwnerWeekdayRules,
  updateOwnerWeekdayRules,
  listOwnerClients,
} = require("../../../controllers/v1/owner/settings.controller");
const {
  getOwnerProfile,
  updateOwnerProfile,
} = require("../../../controllers/v1/owner/profile.controller");
const {
  getOwnerSpecialOffers,
  replaceOwnerSpecialOffers,
} = require("../../../controllers/v1/owner/specialOffers.controller");
const {
  uploadOwnerImage,
  uploadOwnerPromoImage,
  uploadOwnerCatalogImage,
} = require("../../../controllers/v1/owner/uploads.controller");
const { uploadSingleImage } = require("../../../middlewares/uploadImage");

const router = Router();

router.use(requireOwner);

router.get("/profile", getOwnerProfile);
router.patch("/profile", updateOwnerProfile);
router.post("/uploads/image", uploadSingleImage("file"), uploadOwnerImage);
router.post("/uploads/promo-image", uploadSingleImage("file"), uploadOwnerPromoImage);
router.post("/uploads/catalog-image", uploadSingleImage("file"), uploadOwnerCatalogImage);

router.get("/special-offers", getOwnerSpecialOffers);
router.put("/special-offers", replaceOwnerSpecialOffers);

router.get("/holidays", listOwnerHolidays);
router.post("/holidays", upsertOwnerHoliday);
router.delete("/holidays/:date", deleteOwnerHoliday);

router.get("/weekday-rules", listOwnerWeekdayRules);
router.put("/weekday-rules", updateOwnerWeekdayRules);

router.get("/clients", listOwnerClients);

module.exports = router;

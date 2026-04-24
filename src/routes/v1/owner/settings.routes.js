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

const router = Router();

router.use(requireOwner);

router.get("/holidays", listOwnerHolidays);
router.post("/holidays", upsertOwnerHoliday);
router.delete("/holidays/:date", deleteOwnerHoliday);

router.get("/weekday-rules", listOwnerWeekdayRules);
router.put("/weekday-rules", updateOwnerWeekdayRules);

router.get("/clients", listOwnerClients);

module.exports = router;

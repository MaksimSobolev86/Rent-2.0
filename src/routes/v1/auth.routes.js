const { Router } = require("express");
const { registerOwner, loginOwner } = require("../../controllers/v1/auth.controller");

const router = Router();

router.post("/owner/register", registerOwner);
router.post("/owner/login", loginOwner);

module.exports = router;

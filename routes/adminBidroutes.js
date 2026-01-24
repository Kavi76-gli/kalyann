const express = require("express");
const router = express.Router();

const {
  placeBet,
  getAllUserBids,
  getMyBids
} = require("../controllers/adminBidController");

const { auth, adminOnly } = require("../middleware/admin-auth-middleware");

/* ======================================
   USER → PLACE BET
====================================== */
router.post("/bet/place", auth, placeBet);

/* ======================================
   ADMIN → VIEW ALL USER BIDS
====================================== */
router.get("/admin/bids", auth, adminOnly, getAllUserBids);
// USER → BID HISTORY
router.get("/my-bids", auth, getMyBids);
module.exports = router;

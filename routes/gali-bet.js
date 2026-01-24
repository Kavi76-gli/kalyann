const express = require("express");
const router = express.Router();

const {
  placeGaliBet,
  getAllGaliBets,
  getPendingGaliBets,
  getMyGaliBets
  
} = require("../controllers/gali-bet-controller");

const { auth, adminOnly } = require("../middleware/admin-auth-middleware");

/* ======================================
   USER → PLACE GALI BET
====================================== */
router.post("/place", auth, placeGaliBet);

/* ======================================
   USER → MY GALI BET HISTORY
====================================== */
router.get("/my", auth, getMyGaliBets);

/* ======================================
   ADMIN → ALL GALI BIDS
====================================== */
router.get("/admin/all", auth, adminOnly, getAllGaliBets);

/* ======================================
   ADMIN → PENDING GALI BIDS
====================================== */
router.get("/admin/pending", auth, adminOnly, getPendingGaliBets);


module.exports = router;

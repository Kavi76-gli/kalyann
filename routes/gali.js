const express = require("express");
const router = express.Router();

const {
  createGaliMatch,
  getAllGaliMatches,
  getGaliZone,
  getSingleGali,
  deleteGaliMatch,
  declareGaliResult,
  resetGaliResult,
  getGaliBetsSummary,
  getGaliBetsByMatch
} = require("../controllers/gali-controller");

const { auth, adminOnly } = require("../middleware/admin-auth-middleware");

/* ======================================
   ADMIN → CREATE GALI MATCH
====================================== */
router.post(
  "/admin/create",
  auth,
  adminOnly,
  createGaliMatch
);

/* ======================================
   ADMIN → GET ALL GALI MATCHES
====================================== */
router.get(
  "/admin/all",
  auth,
  adminOnly,
  getAllGaliMatches
);

/* ======================================
   USER → GET GALI GAME ZONE (TODAY)
====================================== */
router.get(
  "/zone",
  auth,
  getGaliZone
);

/* ======================================
   USER → GET SINGLE GALI GAME
====================================== */
router.get(
  "/zone/:id",
  auth,
  getSingleGali
);


router.post(
  "/admin/result",
  auth,
  adminOnly,
  declareGaliResult
);

// ===============================
// 🔁 RESET SINGLE GALI MATCH
// ===============================
router.post(
  "/reset",
  auth,
  adminOnly,
  resetGaliResult
);

/* ======================================
   ADMIN → DELETE GALI MATCH
====================================== */
router.delete(
  "/admin/delete/:matchId",
  auth,
  adminOnly,
  deleteGaliMatch
);

// DELETE /api/gali/admin/:matchId
router.delete("/gali/admin/:matchId", auth, adminOnly, deleteGaliMatch);



router.get(
  "/admin/bets-summary/:matchId",
  auth,
  adminOnly,
  getGaliBetsSummary
);


router.get(
  "/admin/bets/:matchId",
  auth,
  adminOnly,
  getGaliBetsByMatch
);

module.exports = router;

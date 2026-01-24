const express = require("express");
const router = express.Router();

const {
  createMatch,
  getAllMatches,
  getGameZone,
  declareOpenResult,
  declareCloseResult,
  deleteMatch,
  getSingleGame
} = require("../controllers/match-controller");

const { auth, adminOnly } = require("../middleware/admin-auth-middleware");

/* ======================================
   ADMIN → CREATE GAME
====================================== */
router.post("/admin/create", auth, adminOnly, createMatch);

/* ======================================
   ADMIN → GET ALL GAMES
====================================== */
router.get("/admin/all", auth, adminOnly, getAllMatches);

/* ======================================
   ADMIN → DEPLOY RESULT
====================================== */
router.post("/admin/result/open", auth, adminOnly, declareOpenResult);
router.post("/admin/result/close", auth, adminOnly, declareCloseResult);

/* ======================================
   USER → GAMEZONE
====================================== */
router.get("/gamezone", auth, getGameZone);
router.get("/gamezone/:id", auth, getSingleGame);

/* ======================================
   ADMIN → DELETE MATCH
====================================== */
router.delete("/admin/match/:matchId", auth, adminOnly, deleteMatch);

module.exports = router;

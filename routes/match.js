// routes/match.js
const express = require("express");
const router = express.Router();
const axios = require("axios");

const Match = require("../models/Match");
const Bet = require("../models/bet");
const Wallet = require("../models/wallet");


const {
  createMatch,
  getAllMatches,
  getGameZone,
  resetMatchResult,
  resetAllMatchResults,
  deleteMatch,
  getSingleGame,
} = require("../controllers/match-controller");

const { auth, adminOnly } = require("../middleware/admin-auth-middleware");

// ===================== CONFIG: App 1 =====================

// ---------------- CONFIG: App 1 ----------------
const APP1_URL = "https://kalyan-2.onrender.com/api/match/admin/all"; 
const APP1_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5NjVlZmZjNDM5NTU0MWJhZjljZGFlZiIsImlzQWRtaW4iOnRydWUsImlhdCI6MTc3MzEyOTYxOCwiZXhwIjoxODA0NjY1NjE4fQ.fjhH-Ip7ojzvX3Ufa-ktysmlUnvUk750v9sGgxn1Sl4"; // Replace with App1 token

// ---------------- SETTLE BETS ----------------
async function settleBets(match) {
  const matchId = match._id;

  // OPEN RESULT
  if (match.openResult && !match.openPayoutDone) {
    const bets = await Bet.find({ match: matchId, betFor: "open", isSettled: false }).populate("user");
    const walletCache = new Map();

    for (const bet of bets) {
      let winAmount = 0;
      const betNum = String(bet.number);
      const betType = bet.betType.toLowerCase();
      const openPanel = String(match.openResult.panel);
      const openSingle = String(match.openResult.single);

      if (betType === "single" && betNum === openSingle) winAmount = bet.amount * PAYOUT.single;
      if (["singlepanna","doublepanna","triplepanna"].includes(betType) && betNum === openPanel)
        winAmount = bet.amount * PAYOUT[betType];
      if (betType === "halfsangam" && betNum === `${openPanel}-${openPanel}`)
        winAmount = bet.amount * PAYOUT.halfSangam;

      if (winAmount > 0) {
        const userId = bet.user._id.toString();
        let wallet = walletCache.get(userId);
        if (!wallet) {
          wallet = await Wallet.findOne({ userId });
          walletCache.set(userId, wallet);
        }

        if (wallet) {
          wallet.balance += winAmount;
          wallet.transactions.push({
            type: "win",
            amount: winAmount,
            status: "approved",
            remark: `OPEN ${bet.betType.toUpperCase()} WIN`
          });
          await wallet.save();
        }
        bet.resultStatus = "won";
      } else {
        bet.resultStatus = "lost";
      }

      bet.isSettled = true;
      await bet.save();
    }

    match.openPayoutDone = true;
    await match.save();
  }

  // CLOSE RESULT
  if (match.closeResult && !match.closePayoutDone) {
    const bets = await Bet.find({ match: matchId, isSettled: false }).populate("user");
    const walletCache = new Map();

    const openPanel = String(match.openResult?.panel);
    const openSingle = String(match.openResult?.single);
    const closePanel = String(match.closeResult.panel);
    const closeSingle = String(match.closeResult.single);
    const jodi = openSingle + closeSingle;

    for (const bet of bets) {
      let winAmount = 0;
      const betNum = String(bet.number);
      const betType = bet.betType.toLowerCase();

      if (betType === "single" && bet.betFor === "close" && betNum === closeSingle)
        winAmount = bet.amount * PAYOUT.single;
      if (betType === "jodi" && betNum === jodi)
        winAmount = bet.amount * PAYOUT.jodi;
      if (["singlepanna","doublepanna","triplepanna"].includes(betType) &&
          (betNum === openPanel || betNum === closePanel))
        winAmount = bet.amount * PAYOUT[betType];
      if (betType === "halfsangam" &&
          (betNum === `${openPanel}-${closeSingle}` || betNum === `${openSingle}-${closePanel}`))
        winAmount = bet.amount * PAYOUT.halfSangam;
      if (betType === "fullsangam" && betNum === `${openPanel}-${closePanel}`)
        winAmount = bet.amount * PAYOUT.fullSangam;

      if (winAmount > 0) {
        const userId = bet.user._id.toString();
        let wallet = walletCache.get(userId);
        if (!wallet) {
          wallet = await Wallet.findOne({ userId });
          walletCache.set(userId, wallet);
        }

        if (wallet) {
          wallet.balance += winAmount;
          wallet.transactions.push({
            type: "win",
            amount: winAmount,
            status: "approved",
            remark: `CLOSE ${bet.betType.toUpperCase()} WIN`
          });
          await wallet.save();
        }
        bet.resultStatus = "won";
      } else {
        bet.resultStatus = "lost";
      }

      bet.isSettled = true;
      await bet.save();
    }

    match.closePayoutDone = true;
    await match.save();
  }
}

// ---------------- SYNC RESULTS FROM APP1 ----------------
async function syncResultsFromApp1() {
  try {
    console.log("⏳ Syncing results from App1...");

    const res = await axios.get(APP1_URL, {
      headers: { Authorization: `Bearer ${APP1_TOKEN}` }
    });

    if (!res.data.success) return console.log("❌ App1 returned no results");

    const app1Matches = res.data.matches;

    for (const app1Match of app1Matches) {
      // Match by gameName and time range (tolerance 1 min)
      const match = await Match.findOne({
        gameName: app1Match.gameName,
        openTime: { $gte: new Date(new Date(app1Match.openTime) - 60000), $lte: new Date(new Date(app1Match.openTime) + 60000) },
        closeTime: { $gte: new Date(new Date(app1Match.closeTime) - 60000), $lte: new Date(new Date(app1Match.closeTime) + 60000) },
      });

      if (!match) continue;

      let updated = false;

      // ✅ Update Open Result if App1 has declared
      if (app1Match.openResult && (!match.openResult || match.openResult.single === "***")) {
        match.openResult = app1Match.openResult;
        match.openPayoutDone = false;
        updated = true;
      }

      // ✅ Update Close Result if App1 has declared
      if (app1Match.closeResult && (!match.closeResult || match.closeResult.single === "***")) {
        match.closeResult = app1Match.closeResult;
        match.closePayoutDone = false;
        updated = true;
      }

      if (updated) {
        await match.save();
        await settleBets(match);
        console.log(`✅ Synced match ${match.gameName} from App1`);
      }
    }
  } catch (err) {
    console.error("Error syncing results from App1:", err.message);
  }
}

// ---------------- CONTROLLER EXPORTS ----------------
exports.declareOpenResult = async (req, res) => {
  try {
    const { matchId, panel, single } = req.body;
    if (!matchId || panel === undefined || single === undefined)
      return res.status(400).json({ msg: "Missing data" });

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ msg: "Match not found" });

    if (match.openResult?.single && match.openResult.single !== "***")
      return res.status(400).json({ msg: "Open result already declared" });

    match.openResult = { panel: String(panel), single: String(single) };
    match.openPayoutDone = false;
    await match.save();

    await settleBets(match);

    res.json({ success: true, msg: "Open result declared & settled" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};

exports.declareCloseResult = async (req, res) => {
  try {
    const { matchId, panel, single } = req.body;
    if (!matchId || panel === undefined || single === undefined)
      return res.status(400).json({ msg: "Missing data" });

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ msg: "Match not found" });

    if (!match.openResult || match.openResult.single === "***")
      return res.status(400).json({ msg: "Open result not declared yet" });

    if (match.closeResult?.single && match.closeResult.single !== "***")
      return res.status(400).json({ msg: "Close result already declared" });

    match.closeResult = { panel: String(panel), single: String(single) };
    match.closePayoutDone = false;
    await match.save();

    await settleBets(match);

    res.json({ success: true, msg: "Close result declared & settled" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};

// ---------------- AUTO SYNC ----------------
exports.syncResultsFromApp1 = syncResultsFromApp1;

// Auto-sync every 10 seconds
setInterval(syncResultsFromApp1, 10000);
// ===================== USER ROUTES =====================
router.get("/gamezone", auth, getGameZone);
router.get("/gamezone/:id", auth, getSingleGame);

// ===================== ADMIN CRUD =====================
router.post("/admin/create", auth, adminOnly, createMatch);
router.get("/admin/all", auth, adminOnly, getAllMatches);
router.post("/reset", auth, adminOnly, resetMatchResult);
router.post("/reset-all", auth, adminOnly, resetAllMatchResults);
router.delete("/admin/match/:matchId", auth, adminOnly, deleteMatch);

module.exports = router;
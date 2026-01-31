const GaliMatch = require("../models/GaliMatch");
const Bet = require("../models/bet");
const Wallet = require("../models/wallet");
const GaliBet = require("../models/GaliBet");





exports.createGaliMatch = async (req, res) => {
  try {
    const {
      gameName,
      gameCode,
      openTime,
      resultTime,
      minBet = 10,
      maxBet = 10000,
      payout,
      allowedTypes
    } = req.body;

    // ---------------- BASIC VALIDATION ----------------
    if (!gameName || !gameCode || !openTime || !resultTime) {
      return res.status(400).json({ msg: "Required fields missing (gameName, gameCode, openTime, resultTime)" });
    }

    // ---------------- TIME FORMAT VALIDATION ----------------
    const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
    if (![openTime, resultTime].every(t => timeRegex.test(t))) {
      return res.status(400).json({ msg: "Invalid time format (HH:mm)" });
    }

    // ---------------- DUPLICATE GAME CHECK ----------------
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const exists = await GaliMatch.findOne({
      gameCode: gameCode.toUpperCase(),
      gameDate: { $gte: today }
    });
    if (exists) {
      return res.status(400).json({ msg: "Gali game already exists for today (runs daily automatically)" });
    }

    // ---------------- CREATE GALI GAME ----------------
    const match = await GaliMatch.create({
      gameName,
      gameCode: gameCode.toUpperCase(),
      openTime,
      resultTime,
      minBet: Number(minBet),
      maxBet: Number(maxBet),
      payout: { single: 9, jodi: 90, ...payout },
      allowedTypes: allowedTypes?.length ? allowedTypes : ["single", "jodi"],

      gameDate: today,
      isActive: true,

      // Initialize open results only
      openResult: { left: null, right: null, jodi: null },

      createdBy: req.user.id
    });

    res.json({
      success: true,
      msg: "Gali game created successfully. Only Open bets allowed. Game will run daily automatically.",
      match
    });

  } catch (err) {
    console.error("createGaliMatch error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};






/* ======================================
   USER → GALI GAME ZONE
====================================== */

const PAYOUT = {
  gali: { single: 9.5, jodi: 95 } // payout multiplier
};

exports.getGaliZone = async (req, res) => {
  try {
    const now = new Date();

    // ===== IST TIME =====
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const istMinutes = (utcMinutes + 330) % 1440; // IST
    const isAfter3AM = istMinutes >= 180;

    const toMinutes = (time) => {
      if (!time) return 0;
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };

    const matches = await GaliMatch.find({ isActive: true }).sort({
      openTime: 1
    });

    const games = matches.map(game => {
      const openMin = toMinutes(game.openTime);
      const resultMin = toMinutes(game.resultTime);

      // ===== BID STATUS (CORRECT) =====
      let bidStatus = "Bids Closed";

      if (istMinutes < openMin) {
        bidStatus = "Open & Close Bids Running";
      } else if (istMinutes >= openMin && istMinutes < resultMin) {
        bidStatus = "Close Bids Running";
      }

      // ===== RESULT TEXT (RESET SAFE) =====
      let resultText = "**";

      if (!isAfter3AM && game.openResult?.jodi) {
        // Before 3 AM → show yesterday result
        resultText = game.openResult.jodi;
      }

      if (isAfter3AM && istMinutes >= resultMin && game.openResult?.jodi) {
        // After result time today
        resultText = game.openResult.jodi;
      }

      return {
        gameId: game._id,
        gameName: game.gameName,
        openTime: game.openTime,
        resultTime: game.resultTime,
        bidStatus,
        resultText
      };
    });

    res.json({
      success: true,
      after3AM: isAfter3AM,
      games
    });

  } catch (err) {
    console.error("getGaliZone error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};



/* ======================================
   ADMIN → DECLARE GALI OPEN RESULT
====================================== */
/* ======================================
   ADMIN → DECLARE GALI OPEN RESULT
====================================== */
exports.declareGaliResult = async (req, res) => {
  try {
    const { matchId, left, right } = req.body;

    if (!matchId) {
      return res.status(400).json({ msg: "Match ID required" });
    }

    // ✅ validate digits (0–9)
    if (
      left === undefined || right === undefined ||
      isNaN(left) || isNaN(right) ||
      left < 0 || left > 9 ||
      right < 0 || right > 9
    ) {
      return res.status(400).json({ msg: "Enter valid digits (0–9)" });
    }

    const l = String(left);
    const r = String(right);
    const jodi = `${l}${r}`;
    const reverseJodi = `${r}${l}`;

    const match = await GaliMatch.findById(matchId);
    if (!match) return res.status(404).json({ msg: "Game not found" });
    if (match.resultDeclared)
      return res.status(400).json({ msg: "Result already declared" });

    // ✅ Save open result only
    match.openResult = { left: l, right: r, jodi };
    match.resultDeclared = true;
    await match.save();

    // ---------------- Process bets ----------------
    const bets = await GaliBet.find({ match: matchId, isSettled: false }).populate("user");

    let winners = 0;
    let totalWinAmount = 0;
    const walletCache = new Map();

    for (const bet of bets) {
      let winAmount = 0;
      const betType = bet.betType.toLowerCase();
      const num = String(bet.number);

      /* ========== SINGLE BET ========== */
      if (betType === "single") {
        if (num === l || num === r) {
          winAmount = bet.amount * PAYOUT.gali.single;
        }
      }

      /* ========== JODI BET ========== */
      if (betType === "jodi") {
        if (num === jodi || num === reverseJodi) {
          winAmount = bet.amount * PAYOUT.gali.jodi;
        }
      }

      // ✅ settle bet
      bet.resultStatus = winAmount > 0 ? "won" : "lost";
      bet.isSettled = true;
      await bet.save();

      if (winAmount > 0) {
        winners++;
        totalWinAmount += winAmount;

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
            remark: `Gali ${betType.toUpperCase()} win (${num})`
          });
          await wallet.save();
        }
      }
    }

    res.json({
      success: true,
      msg: "Gali result declared successfully",
      result: match.openResult,
      winners,
      totalWinAmount
    });

  } catch (err) {
    console.error("declareGaliResult error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};


const mongoose = require("mongoose");

exports.resetGaliResult = async (req, res) => {
  try {
    const { matchId } = req.body;

    if (!matchId || !mongoose.Types.ObjectId.isValid(matchId)) {
      return res.status(400).json({ msg: "Invalid Gali Match ID" });
    }

    const match = await GaliMatch.findById(matchId);
    if (!match) {
      return res.status(404).json({ msg: "Gali match not found" });
    }

    match.openResult = null;
    match.resultDeclared = false;
    await match.save();

    await GaliBet.updateMany(
      { match: matchId },
      { $set: { isSettled: false, resultStatus: "pending" } }
    );

    res.json({ success: true, msg: "Gali result reset successfully" });

  } catch (err) {
    console.error("resetGaliResult error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

/* ======================================
   ADMIN → GET GALI BETS SUMMARY
====================================== */
exports.getGaliBetsSummary = async (req, res) => {
  try {
    const { matchId } = req.params;
    const bets = await GaliBet.find({ match: matchId });

    let totalBet = 0;
    let totalWin = 0;
    let totalLoss = 0;
    const users = new Set();

    // Define summary keys
    const summary = {
      leftSingle: { count: 0, totalWin: 0, totalLoss: 0 },
      rightSingle: { count: 0, totalWin: 0, totalLoss: 0 },
      jodi: { count: 0, totalWin: 0, totalLoss: 0 }
    };

    bets.forEach(bet => {
      totalBet += bet.amount;
      users.add(String(bet.user));

      // Normalize bet type
      let type = bet.betType;
      if (type === "single" && bet.betFor === "left") type = "leftSingle";
      else if (type === "single" && bet.betFor === "right") type = "rightSingle";
      else if (type === "jodi") type = "jodi";

      if (!summary[type]) return; // skip unknown types

      if (bet.resultStatus === "won") {
        summary[type].count += 1;
        summary[type].totalWin += bet.winAmount || (type === "jodi" ? bet.amount * 90 : bet.amount * 9);
        totalWin += bet.winAmount || (type === "jodi" ? bet.amount * 90 : bet.amount * 9);
      } else if (bet.resultStatus === "lost") {
        summary[type].totalLoss += bet.amount;
        totalLoss += bet.amount;
      }
    });

    res.json({
      success: true,
      totalPlayers: users.size,
      totalBet,
      totalWin,
      totalLoss,
      summary
    });
  } catch (err) {
    console.error("getGaliBetsSummary:", err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};


/* ======================================
   ADMIN → GET GALI BETS BY MATCH
====================================== */
exports.getGaliBetsByMatch = async (req, res) => {
  try {
    const { matchId } = req.params;

    const bets = await GaliBet.find({ match: matchId })
      .populate("user", "name phone")
      .sort({ createdAt: -1 });

    // Prepare a clean structure showing bet type and win/loss
    const formattedBets = bets.map(bet => ({
      user: {
        name: bet.user.name,
        phone: bet.user.phone
      },
      betType: bet.betType,
      number: bet.number,
      amount: bet.amount,
      resultStatus: bet.resultStatus,
      winAmount: bet.resultStatus === "won" ? (bet.winAmount || (bet.betType === "jodi" ? bet.amount * 90 : bet.amount * 9)) : 0,
      createdAt: bet.createdAt
    }));

    res.json({
      success: true,
      bets: formattedBets
    });

  } catch (err) {
    console.error("getGaliBetsByMatch:", err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};


/* ======================================
   ADMIN → GET ALL GALI MATCHES
====================================== */
exports.getAllGaliMatches = async (req, res) => {
  try {
    const matches = await GaliMatch.find().sort({ openTime: 1 });
    res.json({ success: true, matches });
  } catch (err) {
    console.error("getAllGaliMatches:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

/* ======================================
   USER → GET SINGLE GALI GAME
====================================== */
exports.getSingleGali = async (req, res) => {
  try {
    const game = await GaliMatch.findById(req.params.id);
    if (!game) return res.status(404).json({ msg: "Game not found" });

    res.json({ success: true, game });
  } catch (err) {
    console.error("getSingleGali:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

/* ======================================
   ADMIN → DELETE GALI GAME
====================================== */
/* ======================================
   ADMIN → DELETE GALI MATCH
====================================== */
exports.deleteGaliMatch = async (req, res) => {
  try {
    const { matchId } = req.params;

    if (!matchId) {
      return res.status(400).json({ success: false, msg: "Match ID is required" });
    }

    const match = await GaliMatch.findById(matchId);
    if (!match) {
      return res.status(404).json({ success: false, msg: "Match not found" });
    }

    await match.deleteOne(); // Remove match from DB

    res.json({ success: true, msg: "Gali match deleted successfully" });
  } catch (err) {
    console.error("deleteGaliMatch:", err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};


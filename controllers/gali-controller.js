const GaliMatch = require("../models/GaliMatch");
const Bet = require("../models/bet");
const Wallet = require("../models/wallet");
const GaliBet = require("../models/GaliBet");





/* ======================================
   ADMIN → CREATE GALI MATCH
====================================== */
/* ======================================
   ADMIN → CREATE GALI MATCH (ONE TIME)
====================================== */
exports.createGaliMatch = async (req, res) => {
  try {
    const { gameName, gameCode, openTime, closeTime, resultTime, minBet, maxBet } = req.body;

    if (!gameName || !gameCode || !openTime || !closeTime || !resultTime) {
      return res.status(400).json({ success: false, msg: "Required fields missing" });
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(openTime) || !timeRegex.test(closeTime) || !timeRegex.test(resultTime)) {
      return res.status(400).json({ success: false, msg: "Invalid time format (HH:mm)" });
    }

    // ❌ NO DAILY DATE CHECK
    const exists = await GaliMatch.findOne({ gameCode });
    if (exists) {
      return res.status(400).json({ success: false, msg: "Gali game already exists" });
    }

    const match = await GaliMatch.create({
      gameName,
      gameCode,
      openTime,
      closeTime,
      resultTime,
      minBet: minBet ? Number(minBet) : 10,
      maxBet: maxBet ? Number(maxBet) : 10000,
      createdBy: req.user.id,
      isActive: true,
      openResult: {},   // reset daily at 3AM
      resultDeclared: false
    });

    res.json({ success: true, match, msg: "Gali game created successfully (Reusable daily)" });
  } catch (err) {
    console.error("createGaliMatch:", err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};


/* ======================================
   USER → GALI GAME ZONE
====================================== */

const PAYOUT = {
  gali: { single: 9, jodi: 90 } // payout multiplier
};


exports.getGaliZone = async (req, res) => {
  try {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const isAfter3AM = currentMinutes >= 180;

    const matches = await GaliMatch.find({ isActive: true }).sort({ openTime: 1 });

    const toMinutes = (time) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };

    const games = matches.map(game => {
      const openMin = toMinutes(game.openTime);
      const closeMin = toMinutes(game.closeTime);

      let bidStatus = "Upcoming";
      let resultText = "**";
      let openResult = null;

      const isNightGame = closeMin < openMin;

      const isOpen =
        (!isNightGame && currentMinutes >= openMin && currentMinutes < closeMin) ||
        (isNightGame && (currentMinutes >= openMin || currentMinutes < closeMin));

      if (isOpen) bidStatus = "Bids Running";
      else bidStatus = "Bids Closed";

      // 🔁 DAILY RESET AFTER 3 AM
      if (isAfter3AM) {
        openResult = null;
        resultText = "**";
      } else {
        if (game.openResult?.jodi) {
          openResult = game.openResult;
          resultText = game.openResult.jodi;
        }
      }

      return {
        gameId: game._id,
        gameName: game.gameName,
        openTime: game.openTime,
        closeTime: game.closeTime,
        resultTime: game.resultTime,
        openResult,
        resultText,
        bidStatus
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
exports.declareGaliResult = async (req, res) => {
  try {
    const { matchId, left, right } = req.body;

    if (!matchId) {
      return res.status(400).json({ msg: "Match ID required" });
    }

    // ✅ validate digits
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

    // ✅ Save result
    match.openResult = { left: l, right: r, jodi };
    match.resultDeclared = true;
    await match.save();

    const bets = await GaliBet.find({
      match: matchId,
      isSettled: false
    }).populate("user");

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

      // ✅ settle bet (ONE BET → ONE RESULT)
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


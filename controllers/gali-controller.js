const GaliMatch = require("../models/GaliMatch");
const Bet = require("../models/bet");
const Wallet = require("../models/wallet");
const GaliBet = require("../models/GaliBet");





/* ======================================
   ADMIN → CREATE GALI MATCH
====================================== */
exports.createGaliMatch = async (req, res) => {
  try {
    const { gameName, gameCode, openTime, closeTime, resultTime, minBet, maxBet } = req.body;

    if (!gameName || !gameCode || !openTime || !closeTime || !resultTime) {
      return res.status(400).json({ success: false, msg: "Required fields missing" });
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(openTime) || !timeRegex.test(closeTime) || !timeRegex.test(resultTime)) {
      return res.status(400).json({ success: false, msg: "Invalid time format. Use HH:mm" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const exists = await GaliMatch.findOne({ gameCode, gameDate: today });
    if (exists) {
      return res.status(400).json({ success: false, msg: "Gali game already exists today" });
    }

    const match = await GaliMatch.create({
      gameName,
      gameCode,
      openTime,
      closeTime,
      resultTime,
      minBet: minBet ? Number(minBet) : 10,
      maxBet: maxBet ? Number(maxBet) : 10000,
      gameDate: today,
      createdBy: req.user.id,
      isActive: true,
      openResult: {}, // Will store { left: "", right: "", jodi: "" }
      resultDeclared: false
    });

    res.json({ success: true, match, msg: "Gali match created successfully" });
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

/* ======================================
   USER → GALI GAME ZONE
====================================== */
/* ======================================
   USER → GALI GAME ZONE
====================================== */
exports.getGaliZone = async (req, res) => {
  try {
    const now = new Date();
    const isAfter3AM = now.getHours() >= 3;

    let start = new Date();
    let end = new Date();

    // 🕒 DATE LOGIC
    if (isAfter3AM) {
      // AFTER 3 AM → TODAY
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else {
      // BEFORE 3 AM → YESTERDAY
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);

      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
    }

    const matches = await GaliMatch.find({
      gameDate: { $gte: start, $lte: end },
      isActive: true
    }).sort({ openTime: 1 });

    const games = matches.map(game => {
      let bidStatus = "Upcoming";
      let resultText = "**";
      let openResult = null;

      // ⏱️ Build proper datetime
      const openTime = new Date(`${start.toDateString()} ${game.openTime}`);
      const closeTime = new Date(`${start.toDateString()} ${game.closeTime}`);

      // 🔁 AFTER 3 AM → RESET MODE
      if (isAfter3AM) {
        bidStatus = "Bids Running";
        resultText = "**";
        openResult = null;
      }
      // ⏰ BEFORE 3 AM → NORMAL FLOW
      else {
        if (now < openTime) {
          bidStatus = "Upcoming";
        } else if (now >= openTime && now < closeTime) {
          bidStatus = "Bids Running";
        } else {
          bidStatus = "Bids Closed";
        }

        // ✅ Show result only before 3 AM
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
    console.error("getGaliZone:", err);
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

    // validate digits
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

    // save result
    match.openResult = { left: l, right: r, jodi };
    match.resultDeclared = true;
    await match.save();

    const bets = await GaliBet.find({
      match: matchId,
      isSettled: false
    }).populate("user", "name phone");

    let winners = 0;
    let totalWinAmount = 0;
    const walletCache = new Map();

    for (const bet of bets) {
      let winAmount = 0;
      const betType = bet.betType?.toLowerCase();
      const num = String(bet.number);

      // ✅ SINGLE: match LEFT or RIGHT digit
      if (betType === "single") {
        if (num === l || num === r) {
          winAmount = bet.amount * PAYOUT.gali.single;
        }
      }

      // ✅ JODI: direct or reverse
      if (betType === "jodi") {
        if (num === jodi || num === reverseJodi) {
          winAmount = bet.amount * PAYOUT.gali.jodi;
        }
      }

      // settle bet
      bet.resultStatus = winAmount > 0 ? "won" : "lost";
      bet.isSettled = true;
      await bet.save();

      if (winAmount > 0) {
        winners++;
        totalWinAmount += winAmount;

        let wallet = walletCache.get(bet.user._id.toString());
        if (!wallet) {
          wallet = await Wallet.findOne({ userId: bet.user._id });
          walletCache.set(bet.user._id.toString(), wallet);
        }

        if (wallet) {
          wallet.balance += winAmount;
          wallet.transactions.push({
            type: "win", // enum-safe
            amount: winAmount,
            status: "approved",
            remark: `Gali win ${betType.toUpperCase()} ${num}`
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



exports.declareGaliResult = async (req, res) => {
  try {
    const { matchId, left, right } = req.body;
    if (!matchId) {
      return res.status(400).json({ msg: "Match ID required" });
    }

    // allow partial result
    const hasLeft = left !== undefined && left !== "";
    const hasRight = right !== undefined && right !== "";

    if (!hasLeft && !hasRight) {
      return res.status(400).json({ msg: "Enter left or right digit" });
    }

    const l = hasLeft ? Number(left) : null;
    const r = hasRight ? Number(right) : null;

    if (
      (hasLeft && (Number.isNaN(l) || l < 0 || l > 9)) ||
      (hasRight && (Number.isNaN(r) || r < 0 || r > 9))
    ) {
      return res.status(400).json({ msg: "Enter valid digits (0–9)" });
    }

    const jodi = hasLeft && hasRight ? `${l}${r}` : null;

    const match = await GaliMatch.findById(matchId);
    if (!match) return res.status(404).json({ msg: "Game not found" });
    if (match.resultDeclared)
      return res.status(400).json({ msg: "Result already declared" });

    // ✅ Save result safely
    match.openResult = {
      left: hasLeft ? String(l) : null,
      right: hasRight ? String(r) : null,
      jodi
    };
    match.resultDeclared = hasLeft && hasRight; // full result only if both
    await match.save();

    const bets = await GaliBet.find({
      match: matchId,
      isSettled: false
    }).populate("user", "name phone");

    let winners = 0;
    let totalWinAmount = 0;
    const walletMap = new Map();

    for (const bet of bets) {
    e;
      

      if (winAmount > 0) {
        winners++;
        totalWinAmount += winAmount;

        let wallet = walletMap.get(bet.user._id.toString());
        if (!wallet) {
          wallet = await Wallet.findOne({ userId: bet.user._id });
          walletMap.set(bet.user._id.toString(), wallet);
        }

        if (wallet) {
          wallet.balance += winAmount;
          wallet.transactions.push({
            type: "win", // ✅ enum safe
            amount: winAmount,
            status: "approved",
            remark: `Gali ${bet.betType} ${bet.betFor || ""} win`
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


exports.declareGaliResult = async (req, res) => {
  try {
    const { matchId, left, right } = req.body;

    if (!matchId || left === undefined || right === undefined) {
      return res.status(400).json({ msg: "Invalid data" });
    }

    const l = String(left);
    const r = String(right);
    const jodi = l + r;

    // ✅ FIND MATCH
    const match = await GaliMatch.findById(matchId);
    if (!match) return res.status(404).json({ msg: "Game not found" });
    if (match.resultDeclared) return res.status(400).json({ msg: "Result already declared" });

    // ✅ UPDATE MATCH OPEN RESULT
    match.openResult = { left: l, right: r, jodi };
    match.resultDeclared = true;
    await match.save();

    // ✅ FETCH UNSETTLED BETS
    const bets = await GaliBet.find({ match: matchId, isSettled: false }).populate("user", "name phone");

    let winners = 0;
    let totalWinAmount = 0;
    const winnerDetails = [];
    const walletMap = new Map();

    for (const bet of bets) {
      let winAmount = 0;

      // ✅ CALCULATE WIN BASED ON BET TYPE
      if (bet.betType === "single") {
        if (bet.betFor === "left" && bet.number === l) winAmount = bet.amount * match.payout.single;
        if (bet.betFor === "right" && bet.number === r) winAmount = bet.amount * match.payout.single;
      }

      if (bet.betType === "jodi" && bet.number === jodi) {
        winAmount = bet.amount * match.payout.jodi;
      }

      // ✅ UPDATE BET
      bet.resultStatus = winAmount > 0 ? "won" : "lost";
      bet.isSettled = true;
      await bet.save();

      if (winAmount > 0) {
        winners++;
        totalWinAmount += winAmount;

        winnerDetails.push({
          name: bet.user.name,
          phone: bet.user.phone,
          betType: bet.betType,
          betFor: bet.betFor,
          number: bet.number,
          winAmount
        });

        // ✅ UPDATE WALLET
        let wallet = walletMap.get(bet.user._id.toString());
        if (!wallet) {
          wallet = await Wallet.findOne({ userId: bet.user._id });
          walletMap.set(bet.user._id.toString(), wallet);
        }

        if (wallet) {
          wallet.balance += winAmount;
          wallet.transactions.push({
            type: "gali_win",
            amount: winAmount,
            status: "approved",
            remark: `Gali win (${bet.betType} ${bet.betFor}) - ${bet.number}`
          });
          await wallet.save();
        }
      }
    }

    res.json({
      success: true,
      msg: "Gali result declared successfully",
      openResult: match.openResult,
      winners,
      totalWinAmount,
      winnerDetails
    });

  } catch (err) {
    console.error("declareGaliResult error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

exports.declareGaliResult = async (req, res) => {
  try {
    const { matchId, left, right } = req.body;

    if (!matchId || left === undefined || right === undefined) {
      return res.status(400).json({ msg: "Invalid data" });
    }

    const l = Number(left);
    const r = Number(right);

    if (Number.isNaN(l) || Number.isNaN(r) || l < 0 || l > 9 || r < 0 || r > 9) {
      return res.status(400).json({ msg: "Digits must be 0-9" });
    }

    const jodi = `${l}${r}`;

    // ✅ FIND MATCH
    const match = await GaliMatch.findById(matchId);
    if (!match) return res.status(404).json({ msg: "Game not found" });
    if (match.resultDeclared) return res.status(400).json({ msg: "Result already declared" });

    // ✅ UPDATE MATCH OPEN RESULT
    match.openResult = { left: String(l), right: String(r), jodi };
    match.resultDeclared = true;
    await match.save();

    // ✅ FETCH UNSETTLED BETS
    const bets = await GaliBet.find({ match: matchId, isSettled: false }).populate("user", "name phone");

    let winners = 0;
    let totalWinAmount = 0;
    const winnerDetails = [];
    const walletMap = new Map();

    for (const bet of bets) {
      let winAmount = 0;

      // Calculate win amount based on bet type
      if ((bet.betType === "leftSingle" && bet.number === String(l)) ||
          (bet.betType === "rightSingle" && bet.number === String(r))) {
        winAmount = bet.amount * PAYOUT.gali.single;
      }

      if (bet.betType === "jodi" && bet.number === jodi) {
        winAmount = bet.amount * PAYOUT.gali.jodi;
      }

      bet.resultStatus = winAmount > 0 ? "won" : "lost";
      bet.isSettled = true;
      bet.winAmount = winAmount; // store the actual win amount
      await bet.save();

      if (winAmount > 0) {
        winners++;
        totalWinAmount += winAmount;

        winnerDetails.push({
          name: bet.user.name,
          phone: bet.user.phone,
          betType: bet.betType,
          number: bet.number,
          winAmount
        });

        // Update wallet (with caching)
        let wallet = walletMap.get(bet.user._id.toString());
        if (!wallet) {
          wallet = await Wallet.findOne({ userId: bet.user._id });
          walletMap.set(bet.user._id.toString(), wallet);
        }

        if (wallet) {
          wallet.balance += winAmount;
          wallet.transactions.push({
            type: "gali_win",
            amount: winAmount,
            status: "approved",
            remark: `Gali win (${bet.betType}) - ${jodi}`,
            createdAt: new Date()
          });
          await wallet.save();
        }
      }
    }

    res.json({
      success: true,
      msg: "Gali result declared successfully",
      openResult: { left: String(l), right: String(r), jodi },
      winners,
      totalWinAmount,
      winnerDetails
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


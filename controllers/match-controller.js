const Match = require("../models/Match");

const Bet = require("../models/bet");
const Wallet = require("../models/wallet");
const GaliMatch = require("../models/GaliMatch");



exports.createMatch = async (req, res) => {
  try {
    const {
      gameName,
      gameCode,
      openTime,
      closeTime,
      resultTime,
      minBet = 1,
      maxBet = 100000,
      payout,
      allowedTypes
    } = req.body;

    // ================= BASIC VALIDATION =================
    if (!gameName || !gameCode || !openTime || !closeTime || !resultTime) {
      return res.status(400).json({ msg: "Required fields missing" });
    }

    // ================= TIME FORMAT VALIDATION =================
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

    if (
      !timeRegex.test(openTime) ||
      !timeRegex.test(closeTime) ||
      !timeRegex.test(resultTime)
    ) {
      return res.status(400).json({
        msg: "Invalid time format (HH:mm only, 00:00–23:59)"
      });
    }

    // ================= TIME ORDER CHECK =================
    const toMinutes = (t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };

    if (
      toMinutes(openTime) >= toMinutes(closeTime) ||
      toMinutes(closeTime) >= toMinutes(resultTime)
    ) {
      return res.status(400).json({
        msg: "Time order must be Open < Close < Result"
      });
    }

    // ================= TODAY GAME DATE =================
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const exists = await Match.findOne({
      gameCode,
      gameDate: today
    });

    if (exists) {
      return res.status(400).json({
        msg: "Game already created for today"
      });
    }

    // ================= DEFAULT PAYOUT (MATKA STANDARD) =================
    const defaultPayout = {
      single: 9,
      jodi: 90,
      singlepanna: 140,
      doublepanna: 280,
      triplepanna: 700,
      halfSangam: 1000,
      fullSangam: 10000
    };

    // ================= CREATE MATCH =================
    const match = await Match.create({
      gameName,
      gameCode,
      openTime,
      closeTime,
      resultTime,
      minBet,
      maxBet,
      payout: { ...defaultPayout, ...payout },
      allowedTypes: allowedTypes || Object.keys(defaultPayout),
      gameDate: today,
      isActive: true,
      createdBy: req.user.id
    });

    res.json({
      success: true,
      msg: "Matka game created successfully",
      match
    });

  } catch (err) {
    console.error("createMatch error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};


exports.createMatch = async (req, res) => {
  try {
    const {
      gameName, gameCode, openTime, closeTime,
      resultTime, minBet, maxBet, payout, allowedTypes
    } = req.body;

    if (!gameCode || !openTime || !closeTime || !resultTime) {
      return res.status(400).json({ msg: "Required fields missing" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const exists = await Match.findOne({ gameCode, gameDate: today });
    if (exists) {
      return res.status(400).json({ msg: "Game already exists today" });
    }

    const match = await Match.create({
      gameName,
      gameCode,
      openTime,
      closeTime,
      resultTime,
      minBet,
      maxBet,
      payout,
      allowedTypes,
      gameDate: today,
      isActive: true,
      createdBy: req.user.id
    });

    res.json({ success: true, match });
  } catch (err) {
    console.error("createMatch:", err);
    res.status(500).json({ msg: "Server error" });
  }
};


/* ======================================
   ADMIN → GET ALL GAMES
====================================== */
exports.getAllMatches = async (req, res) => {
  try {
    const matches = await Match.find().sort({ openTime: 1 });
    res.json({ success: true, matches });
  } catch (err) {
    console.error("getAllMatches:", err);
    res.status(500).json({ msg: "Server error" });
  }
};



/* ======================================
   USER → GAMEZONE LIST
====================================== */
/* ======================================
   USER → GAMEZONE LIST (FINAL)
====================================== */


// ------------------------------
// Declare Open Result
// ------------------------------

// ================= NORMAL MATCH =================
const PAYOUT = {
  single: 9,
  jodi: 90,
  singlepanna: 140,
  doublepanna: 280,
  triplepanna: 700,
  halfSangam: 1000,
  fullSangam: 10000
};

// HELPER: Check winner
function isWinner(betType, betNumber, panel, single, openPanel = "") {
  const panelStr = String(panel);
  const betNum = String(betNumber);

  switch (betType) {
    case "single":
      return betNum === String(single);

    case "jodi":
      return betNum === panelStr.slice(-2); // last 2 digits of panel

    case "singlepanna":
      return [...panelStr].every((v, i, arr) => arr.indexOf(v) === i);

    case "doublepanna":
      return /(\d).*\1/.test(panelStr) && !/(.)\1\1/.test(panelStr);

    case "triplepanna":
      return /^(\d)\1\1$/.test(panelStr);

    case "halfSangam":
      return openPanel && betNum === openPanel.slice(0,1) + panelStr.slice(-1);

    case "fullSangam":
      return openPanel && betNum === openPanel + panelStr;

    default:
      return false;
  }
}


exports.declareOpenResult = async (req, res) => {
  try {
    const { matchId, panel, single } = req.body;

    if (!matchId || panel === undefined || single === undefined) {
      return res.status(400).json({ msg: "Missing data" });
    }

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ msg: "Match not found" });

    if (match.openResult?.single) {
      return res.status(400).json({ msg: "Open result already declared" });
    }

    // ✅ Save open result
    match.openResult = {
      panel: String(panel),
      single: String(single)
    };
    await match.save();

    // ✅ ONLY OPEN SINGLE BETS
    const bets = await Bet.find({
      match: matchId,
      betType: "single",
      betFor: "open",
      isSettled: false
    });

    let winners = 0;
    let totalWinAmount = 0;

    for (const bet of bets) {
      const betNum = String(bet.number);

      if (betNum === String(single)) {
        const winAmount = bet.amount * PAYOUT.single;
        winners++;
        totalWinAmount += winAmount;

        const wallet = await Wallet.findOne({ userId: bet.user });
        if (wallet) {
          wallet.balance += winAmount;
          wallet.transactions.push({
            type: "win",
            amount: winAmount,
            status: "approved",
            remark: "Gali Open Single Win"
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

    res.json({
      success: true,
      msg: "Open result declared successfully",
      winners,
      totalWinAmount
    });
  } catch (err) {
    console.error("declareOpenResult error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

exports.declareCloseResult = async (req, res) => {
  try {
    const { matchId, panel, single } = req.body;

    if (!matchId || panel === undefined || single === undefined) {
      return res.status(400).json({ msg: "Missing data" });
    }

    const match = await Match.findById(matchId).populate("bets");
    if (!match) return res.status(404).json({ msg: "Match not found" });

    // Check open result
    if (!match.openResult?.single || !match.openResult?.panel) {
      return res.status(400).json({ msg: "Open result not declared yet" });
    }

    if (match.closeResult?.single) {
      return res.status(400).json({ msg: "Close result already declared" });
    }

    const openSingle = String(match.openResult.single);
    const openPanel  = String(match.openResult.panel);
    const closeSingle = String(single);
    const closePanel  = String(panel);
    const jodi = openSingle + closeSingle;

    // Save close result
    match.closeResult = { panel: closePanel, single: closeSingle };
    await match.save();

    // Fetch unsettled bets
    const bets = await Bet.find({ match: matchId, isSettled: false }).populate("user");

    let winners = 0;
    let totalWinAmount = 0;
    const winnerDetails = [];

    for (const bet of bets) {
      const betNum = String(bet.number);
      let winAmount = 0;

      // SINGLE
      if (bet.betType.toLowerCase() === "single" && bet.betFor === "close") {
        if (betNum === closeSingle) winAmount = bet.amount * PAYOUT.single;
      }

      // JODI
      if (bet.betType.toLowerCase() === "jodi") {
        if (betNum === jodi) winAmount = bet.amount * PAYOUT.jodi;
      }

      // HALF SANGAM
      if (bet.betType.toLowerCase() === "halfsangam") {
        if (betNum === openPanel + closeSingle) winAmount = bet.amount * PAYOUT.halfSangam;
      }

      // FULL SANGAM
      if (bet.betType.toLowerCase() === "fullsangam") {
        if (betNum === openPanel + closePanel) winAmount = bet.amount * PAYOUT.fullSangam;
      }

      if (winAmount > 0) {
        winners++;
        totalWinAmount += winAmount;

        // Update wallet
        let wallet = await Wallet.findOne({ userId: bet.user._id });
        if (!wallet) {
          wallet = new Wallet({ userId: bet.user._id, balance: 0, transactions: [] });
        }
        wallet.balance += winAmount;
        wallet.transactions.push({
          type: "win",
          amount: winAmount,
          status: "approved",
          remark: `Gali ${bet.betType} Win`
        });
        await wallet.save();

        bet.resultStatus = "won";

        winnerDetails.push({
          user: bet.user.name,
          phone: bet.user.phone,
          betType: bet.betType,
          betNumber: bet.number,
          amountWon: winAmount
        });
      } else {
        bet.resultStatus = "lost";
      }

      bet.isSettled = true;
      await bet.save();
    }

    // ✅ Send full data to frontend
    res.json({
      success: true,
      msg: "Close result declared successfully",
      openPanel,
      openSingle,
      closePanel,
      closeSingle,
      jodi,
      winners,
      totalWinAmount,
      winnerDetails
    });
  } catch (err) {
    console.error("declareCloseResult error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};



exports.declareCloseResult = async (req, res) => {
  try {
    const { matchId, panel, single } = req.body;

    if (!matchId || panel === undefined || single === undefined) {
      return res.status(400).json({ msg: "Missing data" });
    }

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ msg: "Match not found" });

    if (!match.openResult?.single || !match.openResult?.panel) {
      return res.status(400).json({ msg: "Open result not declared yet" });
    }

    if (match.closeResult?.single) {
      return res.status(400).json({ msg: "Close result already declared" });
    }

    const openSingle = String(match.openResult.single);
    const openPanel  = String(match.openResult.panel);
    const closeSingle = String(single);
    const closePanel  = String(panel);

    const jodi = openSingle + closeSingle;

    // ✅ Save close result
    match.closeResult = {
      panel: closePanel,
      single: closeSingle
    };
    await match.save();

    const bets = await Bet.find({
      match: matchId,
      isSettled: false
    });

    let winners = 0;
    let totalWinAmount = 0;

    for (const bet of bets) {
      const betNum = String(bet.number);
      let winAmount = 0;

      // ✅ CLOSE SINGLE
      if (bet.betType === "single" && bet.betFor === "close") {
        if (betNum === closeSingle) {
          winAmount = bet.amount * PAYOUT.single;
        }
      }

      // ✅ JODI
      else if (bet.betType === "jodi") {
        if (betNum === jodi) {
          winAmount = bet.amount * PAYOUT.jodi;
        }
      }

      // ✅ HALF SANGAM
      else if (bet.betType === "halfSangam") {
        if (betNum === openPanel + closeSingle) {
          winAmount = bet.amount * PAYOUT.halfSangam;
        }
      }

      // ✅ FULL SANGAM
      else if (bet.betType === "fullSangam") {
        if (betNum === openPanel + closePanel) {
          winAmount = bet.amount * PAYOUT.fullSangam;
        }
      }

      if (winAmount > 0) {
        winners++;
        totalWinAmount += winAmount;

        const wallet = await Wallet.findOne({ userId: bet.user });
        if (wallet) {
          wallet.balance += winAmount;
          wallet.transactions.push({
            type: "win",
            amount: winAmount,
            status: "approved",
            remark: `Gali ${bet.betType} Win`
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

    res.json({
      success: true,
      msg: "Close result declared successfully",
      jodi,
      winners,
      totalWinAmount
    });
  } catch (err) {
    console.error("declareCloseResult error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

// ---------------- OPEN RESULT ----------------
exports.declareOpenResult = async (req, res) => {
  try {
    const { matchId, panel, single } = req.body;
    if (!matchId || !panel || single === undefined)
      return res.status(400).json({ message: "Missing data" });

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });
    if (match.openResult?.panel)
      return res.status(400).json({ message: "Open result already declared" });

    match.openResult = { panel: String(panel), single: String(single) };
    await match.save();

    const bets = await Bet.find({ match: matchId, betFor: "open", isSettled: false });
    let winners = 0, totalWinAmount = 0;

    for (const bet of bets) {
      if (!PAYOUT[bet.betType]) continue;

      const win = isWinner(bet.betType, bet.number, panel, single);

      if (win) {
        const winAmount = bet.amount * PAYOUT[bet.betType];
        totalWinAmount += winAmount;
        winners++;

        const wallet = await Wallet.findOne({ userId: bet.user });
        if (wallet) {
          wallet.balance += winAmount;
          wallet.transactions.push({
            type: "admin_update",
            amount: winAmount,
            status: "approved",
            remark: `Winning for ${bet.betType} open`
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

    res.json({ message: "Open result declared", winners, totalWinAmount });
  } catch (err) {
    console.error("Open Result Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ---------------- CLOSE RESULT ----------------
exports.declareCloseResult = async (req, res) => {
  try {
    const { matchId, panel, single } = req.body;
    if (!matchId || !panel || single === undefined)
      return res.status(400).json({ message: "Missing data" });

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });
    if (match.closeResult?.panel)
      return res.status(400).json({ message: "Close result already declared" });

    match.closeResult = { panel: String(panel), single: String(single) };
    await match.save();

    const openPanel = match.openResult?.panel || "";

    const bets = await Bet.find({ match: matchId, betFor: "close", isSettled: false });
    let winners = 0, totalWinAmount = 0;

    for (const bet of bets) {
      if (!PAYOUT[bet.betType]) continue;

      const win = isWinner(bet.betType, bet.number, panel, single, openPanel);

      if (win) {
        const winAmount = bet.amount * PAYOUT[bet.betType];
        totalWinAmount += winAmount;
        winners++;

        const wallet = await Wallet.findOne({ userId: bet.user });
        if (wallet) {
          wallet.balance += winAmount;
          wallet.transactions.push({
            type: "admin_update",
            amount: winAmount,
            status: "approved",
            remark: `Winning for ${bet.betType} close`
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

    res.json({ message: "Close result declared", winners, totalWinAmount });
  } catch (err) {
    console.error("Close Result Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getGameZone = async (req, res) => {
  try {
    const now = new Date();

    // ⏰ CHECK IF TIME IS AFTER 3 AM
    const isAfter3AM = now.getHours() >= 3;

    let query = { isActive: true };

    // ❌ Before 3 AM → only TODAY games
    if (!isAfter3AM) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      query.gameDate = today;
    }
    // ✅ After 3 AM → NO date filter (all active games)

    const matches = await Match.find(query).sort({ openTime: 1 });

    const games = matches.map(game => {
      let bidStatus = "Upcoming";

      if (now < game.openTime) {
        bidStatus = "Bids are running (Open)";
      } else if (now >= game.openTime && now < game.closeTime) {
        bidStatus = "Bids are running (Close)";
      } else {
        bidStatus = "Bids Closed";
      }

      return {
        gameId: game._id,
        gameName: game.gameName,
        openTime: game.openTime,
        closeTime: game.closeTime,
        openResult: game.openResult || null,
        closeResult: game.closeResult || null,
        status: game.status,
        bidStatus
      };
    });

    res.json({
      success: true,
      after3AM: isAfter3AM, // 👈 helpful for frontend
      games
    });

  } catch (err) {
    console.error("getGameZone:", err);
    res.status(500).json({ msg: "Server error" });
  }
};


exports.getGameZone = async (req, res) => {
  try {
    const now = new Date();

    // ✅ TODAY DATE (IMPORTANT)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ✅ FETCH ONLY TODAY ACTIVE GAMES
    const matches = await Match.find({
      isActive: true,
      gameDate: today
    }).sort({ openTime: 1 });

    const games = matches.map(game => {
      let bidStatus = "Upcoming";

      if (now < game.openTime) {
        bidStatus = "Bids are running (Open)";
      } else if (now >= game.openTime && now < game.closeTime) {
        bidStatus = "Bids are running (Close)";
      } else {
        bidStatus = "Bids Closed";
      }

      return {
        gameId: game._id,
        gameName: game.gameName,
        openTime: game.openTime,
        closeTime: game.closeTime,
        openResult: game.openResult || null,
        closeResult: game.closeResult || null,
        status: game.status,
        bidStatus
      };
    });

    res.json({
      success: true,
      games
    });

  } catch (err) {
    console.error("getGameZone:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

exports.getGameZone = async (req, res) => {
  try {
    const now = new Date();

    const matches = await Match.find({ isActive: true })
      .sort({ openTime: 1 });

    const games = matches.map(game => {
      let bidStatus = "Upcoming";

      if (now < game.openTime) {
        bidStatus = "Bids are running (Open)";
      } else if (now >= game.openTime && now < game.closeTime) {
        bidStatus = "Bids are running (Close)";
      } else {
        bidStatus = "Bids Closed";
      }

      return {
        gameId: game._id,               // ✅ SAME AS matchId
        gameName: game.gameName,
        openTime: game.openTime,
        closeTime: game.closeTime,

        openResult: game.openResult || null,
        closeResult: game.closeResult || null,

        status: game.status,
        bidStatus
      };
    });

    res.json({
      success: true,
      games
    });

  } catch (err) {
    console.error("getGameZone:", err);
    res.status(500).json({ msg: "Server error" });
  }
};
/* ======================================
   ADMIN → DELETE GAME
====================================== */
/* ======================================
   ADMIN → DELETE GAME
====================================== */
exports.deleteMatch = async (req, res) => {
  try {
    console.log("DELETE PARAMS:", req.params); // 🔍 DEBUG

    const matchId = req.params.matchId;

    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: "matchId not received"
      });
    }

    const deleted = await Match.findByIdAndDelete(matchId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Match not found"
      });
    }

    res.json({
      success: true,
      message: "Match deleted successfully"
    });

  } catch (err) {
    console.error("deleteMatch error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};


/* ======================================
   USER → GET SINGLE GAME (LATEST)
====================================== */
exports.getSingleGame = async (req, res) => {
  try {
    const now = new Date();
    const { id } = req.params;

    const game = await Match.findOne({ _id: id, isActive: true });

    if (!game) {
      return res.status(404).json({ msg: "Game not found" });
    }

    let bidStatus = "Upcoming";

    if (now < game.openTime) {
      bidStatus = "Bids are running (Open)";
    } else if (now >= game.openTime && now < game.closeTime) {
      bidStatus = "Bids are running (Close)";
    } else {
      bidStatus = "Bids Closed";
    }

    res.json({
      success: true,
      game: {
        gameId: game._id,          // same as matchId
        gameName: game.gameName,
        openTime: game.openTime,
        closeTime: game.closeTime,

        openResult: game.openResult || null,
        closeResult: game.closeResult || null,

        status: game.status,
        bidStatus
      }
    });

  } catch (err) {
    console.error("getSingleGame:", err);
    res.status(500).json({ msg: "Server error" });
  }
};









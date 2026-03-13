const Match = require("../models/Match");

const Bet = require("../models/bet");
const Wallet = require("../models/wallet");



// ================= PAYOUT DEFAULT =================


// ================= CREATE GAME (ONE TIME) =================
// ================= CREATE GAME (ONE TIME ONLY) =================
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

    // ---------------- BASIC VALIDATION ----------------
    if (!gameName || !gameCode || !openTime || !closeTime || !resultTime) {
      return res.status(400).json({ msg: "Required fields missing" });
    }

    // ---------------- TIME FORMAT ----------------
    const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
    if (![openTime, closeTime, resultTime].every(t => timeRegex.test(t))) {
      return res.status(400).json({ msg: "Invalid time format (HH:mm)" });
    }

    // ---------------- OPEN & CLOSE MUST NOT BE SAME ----------------
    if (openTime === closeTime) {
      return res.status(400).json({
        msg: "Open time and Close time cannot be same"
      });
    }

    // ---------------- DUPLICATE GAME CHECK ----------------
    const exists = await Match.findOne({ gameCode });
    if (exists) {
      return res.status(400).json({
        msg: "Game already exists (runs daily automatically)"
      });
    }

    // ---------------- CREATE GAME ----------------
    const match = await Match.create({
      gameName,
      gameCode: gameCode.toUpperCase(),
      openTime,
      closeTime,
      resultTime,            // used only for daily reset / display
      minBet,
      maxBet,
      payout: { ...PAYOUT, ...payout },
      allowedTypes: allowedTypes?.length ? allowedTypes : Object.keys(PAYOUT),

      // daily reusable game
      isActive: true,

      // results reset daily (cron @ 3 AM)
      openResult: "***",
      closeResult: "***",

      createdBy: req.user.id
    });

    res.json({
      success: true,
      msg: "Game created successfully. Game will run daily.",
      match
    });

  } catch (err) {
    console.error("createMatch error:", err);
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
  single: 9.5,
  jodi: 95,
  singlepanna: 150,
  doublepanna: 300,
  triplepanna: 1000,
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


const payout = require("../config/payout");


exports.declareOpenResult = async (req, res) => {
  try {

    const { matchId, panel, single } = req.body;

    if (!matchId || panel === undefined || single === undefined) {
      return res?.status(400).json({ msg: "Missing data" });
    }

    const match = await Match.findById(matchId);
    if (!match) {
      return res?.status(404).json({ msg: "Match not found" });
    }

    // Prevent double result
    if (match.openResult?.single && match.openResult.single !== "***") {
      return res?.status(400).json({ msg: "Open result already declared" });
    }

    // Save result
    match.openResult = {
      panel: String(panel),
      single: String(single)
    };

    match.openPayoutDone = false;
    await match.save();

    const bets = await Bet.find({
      match: matchId,
      betFor: "open",
      isSettled: false
    }).populate("user");

    let winners = 0;
    let totalWinAmount = 0;

    for (const bet of bets) {

      let winAmount = 0;
      const betNum = String(bet.number);
      const betType = bet.betType.toLowerCase();

      // SINGLE
      if (betType === "single" && betNum === String(single)) {
        winAmount = bet.amount * PAYOUT.single;
      }

      // PANNA
      if (["singlepanna","doublepanna","triplepanna"].includes(betType)) {
        if (betNum === String(panel)) {
          winAmount = bet.amount * PAYOUT[betType];
        }
      }

      // HALF SANGAM
      if (betType === "halfsangam") {
        if (betNum === `${panel}-${panel}`) {
          winAmount = bet.amount * PAYOUT.halfSangam;
        }
      }

      if (winAmount > 0) {

        winners++;
        totalWinAmount += winAmount;

        const wallet = await Wallet.findOne({ userId: bet.user._id });

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

    return res?.json({
      success: true,
      msg: "Open result declared & settled",
      winners,
      totalWinAmount
    });

  } catch (err) {
    console.error("declareOpenResult error:", err);
    return res?.status(500).json({ msg: "Server error" });
  }
};

exports.declareCloseResult = async (req, res) => {

  try {

    const { matchId, panel, single } = req.body;

    if (!matchId || panel === undefined || single === undefined) {
      return res?.status(400).json({ msg: "Missing data" });
    }

    const match = await Match.findById(matchId);
    if (!match) {
      return res?.status(404).json({ msg: "Match not found" });
    }

    if (!match.openResult || match.openResult.single === "***") {
      return res?.status(400).json({ msg: "Open result not declared yet" });
    }

    if (match.closeResult?.single && match.closeResult.single !== "***") {
      return res?.status(400).json({ msg: "Close result already declared" });
    }

    const openSingle = String(match.openResult.single);
    const openPanel = String(match.openResult.panel);

    const closeSingle = String(single);
    const closePanel = String(panel);

    const jodi = openSingle + closeSingle;

    match.closeResult = {
      panel: closePanel,
      single: closeSingle
    };

    match.closePayoutDone = false;

    await match.save();

    const bets = await Bet.find({
      match: matchId,
      isSettled: false
    }).populate("user");

    let winners = 0;
    let totalWinAmount = 0;

    const walletCache = new Map();

    for (const bet of bets) {

      let winAmount = 0;

      const betNum = String(bet.number);
      const betType = bet.betType.toLowerCase();

      if (betType === "single" && bet.betFor === "close" && betNum === closeSingle) {
        winAmount = bet.amount * PAYOUT.single;
      }

      if (betType === "jodi" && betNum === jodi) {
        winAmount = bet.amount * PAYOUT.jodi;
      }

      if (["singlepanna","doublepanna","triplepanna"].includes(betType)) {

        if (betNum === openPanel || betNum === closePanel) {
          winAmount = bet.amount * PAYOUT[betType];
        }
      }

      if (betType === "halfsangam") {

        if (
          betNum === `${openPanel}-${closeSingle}` ||
          betNum === `${openSingle}-${closePanel}`
        ) {
          winAmount = bet.amount * PAYOUT.halfSangam;
        }
      }

      if (betType === "fullsangam") {

        if (betNum === `${openPanel}-${closePanel}`) {
          winAmount = bet.amount * PAYOUT.fullSangam;
        }
      }

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

    return res?.json({
      success: true,
      msg: "Close result declared & settled",
      winners,
      totalWinAmount
    });

  } catch (err) {

    console.error("declareCloseResult error:", err);

    return res?.status(500).json({ msg: "Server error" });
  }
};



exports.resetMatchResult = async (req, res) => {
  try {
    const { matchId } = req.body;

    if (!matchId) {
      return res.status(400).json({ msg: "Match ID required" });
    }

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ msg: "Match not found" });

    match.openResult = undefined;
    match.closeResult = undefined;
    match.openPayoutDone = false;
    match.closePayoutDone = false;

    await match.save();

    res.json({
      success: true,
      msg: "Match result reset successfully"
    });

  } catch (err) {
    console.error("resetMatchResult error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};
exports.resetAllMatchResults = async () => {
  try {
    await Match.updateMany(
      {},
      {
        $unset: {
          openResult: "",
          closeResult: ""
        },
        $set: {
          openPayoutDone: false,
          closePayoutDone: false
        }
      }
    );

    console.log("✅ ALL MATCH RESULTS RESET");
  } catch (err) {
    console.error("❌ resetAllMatchResults error:", err);
  }
};








exports.getGameZone = async (req, res) => {
  try {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const isAfter3AM = currentMinutes >= 180; // 3 * 60

    const matches = await Match.find({ isActive: true }).sort({ openTime: 1 });

    const toMinutes = (time) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };

    const games = matches.map(game => {
      const openMin = toMinutes(game.openTime);
      const closeMin = toMinutes(game.closeTime);

      let bidStatus = "Upcoming";

      // 🌙 Cross-midnight game
      const isNightGame = closeMin < openMin;

      const isOpen =
        (!isNightGame && currentMinutes >= openMin && currentMinutes < closeMin) ||
        (isNightGame && (currentMinutes >= openMin || currentMinutes < closeMin));

      if (isOpen) {
        bidStatus = "Bids are running (Open)";
      } else if (
        (!isNightGame && currentMinutes >= closeMin) ||
        (isNightGame && currentMinutes >= closeMin && currentMinutes < openMin)
      ) {
        bidStatus = "Bids Closed";
      }

      // 🔁 3 AM RESET
      let openResult = game.openResult;
      let closeResult = game.closeResult;

      if (isAfter3AM) {
        openResult = "***";
        closeResult = "***";
      }

      return {
        gameId: game._id,
        gameName: game.gameName,
        openTime: game.openTime,
        closeTime: game.closeTime,
        openResult,
        closeResult,
        bidStatus
      };
    });

    res.json({
      success: true,
      after3AM: isAfter3AM,
      games
    });

  } catch (err) {
    console.error("getGameZone error:", err);
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

// adminController.js


// controllers/match-controller.js
// ======================
// Add tokens to user wallet (Admin)
// ======================
// controllers/match-controller.js
// controllers/adminController.js
// controllers/adminController.js


exports.addTokens = async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, msg: "Invalid input" });
    }

    // Find wallet for the user
    let wallet = await Wallet.findOne({ userId });

    // If wallet does not exist, create it
    if (!wallet) {
      wallet = await Wallet.create({ userId, balance: 0 });
    }

    // Add tokens using $inc
    wallet.balance += Number(amount); // update in memory
    await wallet.save(); // save to DB

    res.json({
      success: true,
      msg: `Added ${amount} tokens to user's wallet`,
      balance: wallet.balance, // updated balance
    });
  } catch (err) {
    console.error("Add tokens error:", err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};
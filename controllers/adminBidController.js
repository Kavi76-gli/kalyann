const Bet = require("../models/bet");
const Match = require("../models/Match");
const Wallet = require("../models/wallet");
/* ======================================
   USER → PLACE BET (FINAL & SAFE)
====================================== */
exports.placeBet = async (req, res) => {
  try {
    let { matchId, betType, betFor, number, amount } = req.body;

    /* ================================
       🔴 BASIC VALIDATION
    ================================ */
    if (!matchId || !betType || !betFor || !number || !amount) {
      return res.status(400).json({ msg: "All fields are required" });
    }

    amount = Number(amount);
    if (isNaN(amount) || amount < 10) {
      return res.status(400).json({ msg: "Minimum bet amount is ₹10" });
    }

    /* ================================
       ✅ NORMALIZE BET TYPE
    ================================ */
    const betTypeMap = {
      "single": "single",
      "jodi": "jodi",

      "single-panna": "singlepanna",
      "singlepanna": "singlepanna",

      "double-panna": "doublepanna",
      "doublepanna": "doublepanna",

      "triple-panna": "triplepanna",
      "triplepanna": "triplepanna",

      "half-sangam": "halfSangam",
      "halfsangam": "halfSangam",

      "full-sangam": "fullSangam",
      "fullsangam": "fullSangam"
    };

    const normalizedBetType =
      betTypeMap[String(betType).trim().toLowerCase()];

    if (!normalizedBetType) {
      return res.status(400).json({ msg: "Invalid bet type" });
    }

    betType = normalizedBetType;

    /* ================================
       🎮 MATCH CHECK
    ================================ */
    const match = await Match.findById(matchId);
    if (!match || !match.isActive) {
      return res.status(404).json({ msg: "Game not available" });
    }

    const now = new Date();

    if (now >= match.closeTime) {
      return res.status(400).json({ msg: "Bidding closed for this game" });
    }

    if (betFor === "open" && match.openResult?.panel) {
      return res.status(400).json({ msg: "Open betting closed" });
    }

    if (betFor === "close" && match.closeResult?.panel) {
      return res.status(400).json({ msg: "Close betting closed" });
    }

    /* ================================
       💰 WALLET CHECK & BET DEBIT
    ================================ */
    let wallet = await Wallet.findOne({ userId: req.user.id });

    if (!wallet) {
      wallet = new Wallet({
        userId: req.user.id,
        balance: 0,
        transactions: []
      });
    }

    if (wallet.balance < amount) {
      return res.status(400).json({ msg: "Insufficient wallet balance" });
    }

    // Deduct amount
    wallet.balance -= amount;

    // 🔥 Wallet bet transaction (THIS IS KEY)
    wallet.transactions.push({
      type: "bet",
      amount: amount,
      status: "success",
      meta: {
        matchId,
        betType,
        betFor,
        number
      },
      createdAt: new Date()
    });

    await wallet.save();

    /* ================================
       🎯 SAVE BET
    ================================ */
    const bet = await Bet.create({
      user: req.user.id,
      match: matchId,
      betType,
      betFor,
      number,
      amount,
      status: "pending",
      isSettled: false
    });

    /* ================================
       ✅ RESPONSE
    ================================ */
    res.json({
      success: true,
      msg: "Bet placed successfully",
      balance: wallet.balance,
      bet
    });

  } catch (err) {
    console.error("placeBet error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};


/* ======================================
   USER → PLACE BET
====================================== */
exports.placeBet = async (req, res) => {
  try {
    const { matchId, betType, betFor, number, amount } = req.body;

    if (!matchId || !betType || !betFor || !number || !amount) {
      return res.status(400).json({ msg: "All fields are required" });
    }

    if (amount < 10) {
      return res.status(400).json({ msg: "Minimum bet amount is ₹10" });
    }

    const match = await Match.findById(matchId);
    if (!match || !match.isActive) {
      return res.status(404).json({ msg: "Game not available" });
    }

    const now = new Date();

    /* ================================
       ⏰ BET TIME RULES
    ================================ */

    // ❌ After close time → nothing allowed
    if (now >= match.closeTime) {
      return res.status(400).json({ msg: "Bidding closed for this game" });
    }

    // ❌ Open result declared → open betting closed
    if (betFor === "open" && match.openResult?.panel) {
      return res.status(400).json({ msg: "Open betting closed" });
    }

    // ❌ Close result declared → close betting closed
    if (betFor === "close" && match.closeResult?.panel) {
      return res.status(400).json({ msg: "Close betting closed" });
    }

    /* ================================
       💰 WALLET CHECK
    ================================ */
    const wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({ msg: "Insufficient wallet balance" });
    }

    // 🔻 Deduct balance
    wallet.balance -= amount;
    await wallet.save();

    /* ================================
       🎯 SAVE BET
    ================================ */
    const bet = await Bet.create({
      user: req.user.id,
      match: matchId,
      betType,
      betFor,
      number,
      amount
    });

    res.json({
      success: true,
      msg: "Bet placed successfully",
      balance: wallet.balance,
      bet
    });

  } catch (err) {
    console.error("placeBet:", err);
    res.status(500).json({ msg: "Server error" });
  }
};



/* ======================================
   ADMIN → VIEW ALL USER BIDS
====================================== */
/* ======================================
   ADMIN → VIEW ALL UNSETTLED USER BIDS
====================================== */
exports.getAllUserBids = async (req, res) => {
  try {
    const { gameId, userId } = req.query;

    const matchFilter = {};
    if (gameId) matchFilter._id = gameId;

    const matches = await Match.find(matchFilter).select(
      "_id openResult closeResult"
    );

    const visibleMatchIds = [];

    for (const m of matches) {
      // ❌ After CLOSE → hide everything
      if (m.closeResult?.single || m.closeResult?.panel) continue;

      visibleMatchIds.push(m._id);
    }

    const betFilter = {
      match: { $in: visibleMatchIds }
    };

    if (userId) betFilter.user = userId;

    const bets = await Bet.find(betFilter)
      .populate("user", "name phone")
      .populate("match", "gameName gameCode openResult closeResult");

    const finalBids = bets.filter(bet => {
      const match = bet.match;

      // 🔴 After OPEN → hide ONLY open single
      if (
        match.openResult?.single &&
        bet.betType === "single" &&
        bet.betFor === "open"
      ) {
        return false;
      }

      // ✅ jodi / half / full / close single stay
      return true;
    });

    res.json({
      success: true,
      bids: finalBids
    });
  } catch (err) {
    console.error("getAllUserBids error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};







/* ======================================
   USER → VIEW BID HISTORY
====================================== */
/* ======================================
   USER → VIEW BID HISTORY
====================================== */
exports.getMyBids = async (req, res) => {
  const bets = await Bet.find({ user: req.user.id })
    .populate("match", "gameName gameCode")
    .sort({ createdAt: -1 });

  res.json({ success: true, bets });
};













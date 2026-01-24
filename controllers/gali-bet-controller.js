const GaliMatch = require("../models/GaliMatch");
const GaliBet = require("../models/GaliBet");
const Wallet = require("../models/wallet");

/* ======================================
   USER → PLACE GALI BET
====================================== */
exports.placeGaliBet = async (req, res) => {
  try {
    let { matchId, betType, betFor, number, amount } = req.body;

    /* ✅ REQUIRED FIELDS CHECK */
    if (!matchId || !betType || !betFor || number === undefined || amount === undefined) {
      return res.status(400).json({ msg: "All fields are required" });
    }

    betType = String(betType).toLowerCase().trim(); // single / jodi
    betFor = String(betFor).toLowerCase().trim();   // left/right/jodi
    number = String(number).trim();
    amount = Number(amount);

    /* ✅ AMOUNT VALIDATION */
    if (isNaN(amount) || amount < 10) {
      return res.status(400).json({ msg: "Minimum bet amount is ₹10" });
    }

    /* ✅ BET TYPE & FOR VALIDATION */
    if (!["single", "jodi"].includes(betType)) {
      return res.status(400).json({ msg: "Invalid bet type" });
    }

    if (betType === "single" && !["left", "right"].includes(betFor)) {
      return res.status(400).json({ msg: "Single bet must be left or right" });
    }

    if (betType === "jodi" && betFor !== "jodi") {
      return res.status(400).json({ msg: "Jodi betFor must be jodi" });
    }

    /* ✅ NUMBER FORMAT CHECK */
    if (betType === "single" && !/^[0-9]$/.test(number)) {
      return res.status(400).json({ msg: "Single number must be 0-9" });
    }

    if (betType === "jodi" && !/^[0-9]{2}$/.test(number)) {
      return res.status(400).json({ msg: "Jodi number must be 00-99" });
    }

    /* ✅ MATCH CHECK */
    const match = await GaliMatch.findById(matchId);
    if (!match || !match.isActive) {
      return res.status(404).json({ msg: "Gali game not available" });
    }

    /* ✅ TIME CHECK */
    const today = new Date();
    const now = new Date();
    const closeTime = new Date(`${today.toDateString()} ${match.closeTime}`);
    if (now >= closeTime) {
      return res.status(400).json({ msg: "Bidding closed for this game" });
    }

    /* ✅ RESULT CHECK - prevent betting after declaration */
    if ((betFor === "left" || betFor === "right" || betFor === "jodi") && match.openResult?.jodi) {
      return res.status(400).json({ msg: "Betting closed for this game (result already declared)" });
    }

    /* ✅ WALLET CHECK */
    let wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) {
      wallet = await Wallet.create({
        userId: req.user.id,
        balance: 0,
        transactions: []
      });
    }

    if (wallet.balance < amount) {
      return res.status(400).json({ msg: "Insufficient wallet balance" });
    }

    /* ✅ DEDUCT WALLET */
    wallet.balance -= amount;
    wallet.transactions.push({
      type: "bet",
      amount,
      status: "success",
      remark: `Gali ${betType} bet placed`,
      meta: { matchId, betType, betFor, number },
      createdAt: new Date()
    });
    await wallet.save();

    /* ✅ SAVE BET */
    const bet = await GaliBet.create({
      user: req.user.id,
      match: matchId,
      betType,
      betFor,
      number,
      amount,
      status: "pending",
      isSettled: false
    });

    res.json({
      success: true,
      msg: "Gali bet placed successfully",
      balance: wallet.balance,
      bet
    });

  } catch (err) {
    console.error("placeGaliBet error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};


/* ======================================
   ADMIN → GET ALL GALI BETS
====================================== */
exports.getAllGaliBets = async (req, res) => {
  try {
    const bets = await GaliBet.find()
      .populate("user", "name phone")
      .populate("match", "gameName gameCode openResult jodi")
      .sort({ createdAt: -1 });

    const formattedBets = bets.map(bet => ({
      user: { name: bet.user.name, phone: bet.user.phone },
      match: {
        gameName: bet.match.gameName,
        gameCode: bet.match.gameCode,
        openResult: bet.match.openResult?.jodi || null
      },
      betType: bet.betType,
      betFor: bet.betFor,
      number: bet.number,
      amount: bet.amount,
      status: bet.status,
      isSettled: bet.isSettled,
      resultStatus: bet.resultStatus || null,
      winAmount: bet.winAmount || 0,
      createdAt: bet.createdAt
    }));

    res.json({ success: true, bets: formattedBets });
  } catch (err) {
    console.error("getAllGaliBets error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};


/* ======================================
   ADMIN → GET PENDING GALI BETS
====================================== */
exports.getPendingGaliBets = async (req, res) => {
  try {
    const bets = await GaliBet.find({ isSettled: false })
      .populate("user", "name phone")
      .populate("match", "gameName gameCode openResult")
      .sort({ createdAt: -1 });

    const formattedBets = bets.map(bet => ({
      user: { name: bet.user.name, phone: bet.user.phone },
      match: { gameName: bet.match.gameName, gameCode: bet.match.gameCode },
      betType: bet.betType,
      betFor: bet.betFor,
      number: bet.number,
      amount: bet.amount,
      status: bet.status,
      createdAt: bet.createdAt
    }));

    res.json({ success: true, bets: formattedBets });
  } catch (err) {
    console.error("getPendingGaliBets error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};


/* ======================================
   USER → GET MY GALI BETS
====================================== */
exports.getMyGaliBets = async (req, res) => {
  try {
    const bets = await GaliBet.find({ user: req.user.id })
      .populate("match", "gameName gameCode openResult")
      .sort({ createdAt: -1 });

    const formattedBets = bets.map(bet => ({
      match: bet.match ? {
        gameName: bet.match.gameName,
        gameCode: bet.match.gameCode,
        openResult: bet.match.openResult?.jodi || null
      } : null,  // if match is deleted
      betType: bet.betType,
      betFor: bet.betFor,
      number: bet.number,
      amount: bet.amount,
      status: bet.status,
      isSettled: bet.isSettled,
      resultStatus: bet.resultStatus || null,
      winAmount: bet.winAmount || 0,
      createdAt: bet.createdAt
    }));

    res.json({ success: true, bets: formattedBets });
  } catch (err) {
    console.error("getMyGaliBets error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

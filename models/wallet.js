const mongoose = require("mongoose");

/* ================================
   TRANSACTION SUB-SCHEMA
================================ */
const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      "deposit",
      "withdraw",
      "admin_update",
      "bet",
      "win",
      "gali_win"   
    ],
    required: true
  },

  amount: {
    type: Number,
    required: true
  },

  status: {
    type: String,
    enum: [
      "pending",
      "approved",
      "rejected",
      "success",
      "failed"
    ],
    default: "success"
  },

  /* ========= DEPOSIT ========= */
  utr: {
    type: String,
    default: null
  },

  /* ========= WITHDRAW ========= */
  method: {
    type: String,
    enum: ["bank", "upi", "qr"],
    default: null
  },

  bankDetails: {
    name: { type: String, default: null },
    account: { type: String, default: null },
    ifsc: { type: String, default: null }
  },

  upiId: {
    type: String,
    default: null
  },
adminHidden: { type: Boolean, default: false },
  /* ========= GAME / COMMON ========= */
  meta: {
    betId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bet",
      default: null
    },
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      default: null
    },
    betType: { type: String, default: null },
    betFor: { type: String, default: null },
    number: { type: String, default: null },
    resultType: { type: String, default: null }
  },

  screenshot: {
    type: String,
    default: null
  },

  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },

  remark: {
    type: String,
    default: ""
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

/* ================================
   WALLET SCHEMA
================================ */
const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },

    balance: {
      type: Number,
      default: 0
    },

    transactions: [transactionSchema]
  },
  { timestamps: true }
);


module.exports = mongoose.model("Wallet", walletSchema);

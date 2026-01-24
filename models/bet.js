const mongoose = require("mongoose");

const betSchema = new mongoose.Schema(
  {
    /* ================================
       👤 USER & MATCH
    ================================ */
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      required: true,
      index: true
    },

    /* ================================
       🎯 BET INFO
    ================================ */
    betType: {
      type: String,
      enum: [
        "single",
        "jodi",
        "singlepanna",
        "doublepanna",
        "triplepanna",
        "halfSangam",
        "fullSangam"
      ],
      required: true
    },

    betFor: {
      type: String,
      enum: ["open", "close"],
      required: true
    },

    number: {
      type: String, // "5", "56", "123"
      required: true
    },

    amount: {
      type: Number,
      required: true,
      min: 1
    },

    /* ================================
       🧮 SANGAM SUPPORT
    ================================ */
    openSingle: {
      type: Number,
      default: null
    },

    openPanel: {
      type: String,
      default: null
    },

    closePanel: {
      type: String,
      default: null
    },

    /* ================================
       🏆 RESULT & PAYOUT
    ================================ */
    status: {
      type: String,
      enum: ["pending", "win", "lose"],
      default: "pending"
    },

    isSettled: {
  type: Boolean,
  default: false
},
resultStatus: {
  type: String,
  enum: ["pending", "won", "lost"],
  default: "pending"
},
winAmount: {
  type: Number,
  default: 0
}

  },
  { timestamps: true }
);

module.exports = mongoose.model("Bet", betSchema);

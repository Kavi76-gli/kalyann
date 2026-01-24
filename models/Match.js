const mongoose = require("mongoose");

const matchSchema = new mongoose.Schema(
  {
    /* ================================
       🎮 GAME INFO
    ================================ */
    gameName: {
      type: String,
      required: true
    },

    gameCode: {
      type: String,
      required: true,
      index: true
    },

    /* ================================
       📅 GAME DATE (IMPORTANT)
    ================================ */
    gameDate: {
      type: Date,
      required: true
    },

    /* ================================
       ⏰ TIMINGS (FULL DATE OBJECT)
    ================================ */
    openTime: {
  type: String, // "13:25"
  required: true,
  match: /^([01]\d|2[0-3]):([0-5]\d)$/ // HH:mm validation
},

closeTime: {
  type: String, // "14:27"
  required: true,
  match: /^([01]\d|2[0-3]):([0-5]\d)$/
},


    /* ================================
       🎯 RESULTS
    ================================ */
    openResult: {
      panel: { type: String, default: null },
      single: { type: Number, default: null }
    },

    closeResult: {
      panel: { type: String, default: null },
      single: { type: Number, default: null }
    },

    /* ================================
       🎲 ALLOWED BET TYPES
    ================================ */
    allowedTypes: {
      single: { type: Boolean, default: true },
      jodi: { type: Boolean, default: true },
      singlepanna: { type: Boolean, default: true },
      doublepanna: { type: Boolean, default: true },
      triplepanna: { type: Boolean, default: true },
      halfSangam: { type: Boolean, default: true },
      fullSangam: { type: Boolean, default: true }
    },

    /* ================================
       💰 PAYOUT MULTIPLIERS
    ================================ */
    payout: {
      single: { type: Number, default: 9 },
      jodi: { type: Number, default: 90 },
      singlepanna: { type: Number, default: 150 },
      doublepanna: { type: Number, default: 300 },
      triplepanna: { type: Number, default: 900 },
      halfSangam: { type: Number, default: 1000 },
      fullSangam: { type: Number, default: 10000 }
    },

    /* ================================
       💵 BET LIMITS
    ================================ */
    minBet: { type: Number, default: 10 },
    maxBet: { type: Number, default: 10000 },

    /* ================================
       📊 GAME STATUS
    ================================ */
    status: {
      type: String,
      enum: [
        "upcoming",
        "running",
        "open_result_declared",
        "result_declared",
        "completed"
      ],
      default: "upcoming"
    },

    /* ================================
       👨‍💼 ADMIN INFO
    ================================ */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    resultDeclaredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    /* ================================
       🔁 DAILY REPLAY
    ================================ */
    isDailyGame: {
      type: Boolean,
      default: true
    },

    /* ================================
       🔐 PAYOUT SAFETY FLAGS
    ================================ */
    openPayoutDone: {
      type: Boolean,
      default: false
    },

    closePayoutDone: {
      type: Boolean,
      default: false
    },

    /* ================================
       🧠 SAFETY
    ================================ */
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Match", matchSchema);

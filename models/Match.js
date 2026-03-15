const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema(
  {
    panel: {
      type: String,
      default: null
    },
    single: {
      type: Number,
      default: null
    },

    // Track who declared result
    declaredBy: {
      type: String,
      enum: ["auto", "admin"],
      default: null
    },

    declaredAt: {
      type: Date,
      default: null
    }
  },
  { _id: false }
);

const matchSchema = new mongoose.Schema(
  {
    /* ================================
       🎮 GAME INFO
    ================================ */

    gameName: {
      type: String,
      required: true,
      trim: true
    },

    gameCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      uppercase: true,
      trim: true
    },

    /* ================================
       ⏰ TIMINGS (HH:mm format)
       Supports cross-midnight games
    ================================ */

    openTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/
    },

    closeTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/
    },

    resultTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/
    },

    /* ================================
       🎯 RESULTS
    ================================ */

    openResult: {
      type: resultSchema,
      default: () => ({})
    },

    closeResult: {
      type: resultSchema,
      default: () => ({})
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

    minBet: {
      type: Number,
      default: 10
    },

    maxBet: {
      type: Number,
      default: 10000
    },

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
      default: "upcoming",
      index: true
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
       🔁 DAILY GAME
    ================================ */

    isDailyGame: {
      type: Boolean,
      default: true
    },

    /* ================================
       🔐 PAYOUT SAFETY
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
       🧠 GENERAL FLAGS
    ================================ */

    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

/* ================================
   ⚡ INDEXES FOR FAST RESULT SYNC
================================ */

matchSchema.index({ gameName: 1, openTime: 1, closeTime: 1 });

/* ================================
   🔄 DAILY RESULT RESET HELPER
================================ */

matchSchema.methods.resetDailyResults = function () {
  this.openResult = { panel: null, single: null, declaredBy: null };
  this.closeResult = { panel: null, single: null, declaredBy: null };
  this.openPayoutDone = false;
  this.closePayoutDone = false;
  this.status = "upcoming";
};

module.exports = mongoose.model("Match", matchSchema);
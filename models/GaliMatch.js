const mongoose = require("mongoose");

const GaliMatchSchema = new mongoose.Schema(
  {
    gameName: {
      type: String,
      required: true,
      default: "GALI DISAWAR"
    },

    gameCode: {
      type: String,
      required: true,
      unique: false
    },

    marketType: {
      type: String,
      default: "gali"
    },

    // ✅ only time format like "10:00"
    openTime: {
      type: String,
      required: true,
      match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:mm
    },

    
    resultTime: {
      type: String,
      required: true,
      match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:mm
    },

    minBet: {
      type: Number,
      default: 10
    },

    maxBet: {
      type: Number,
      default: 10000
    },

    // ✅ Only allow single and jodi
    allowedTypes: {
      type: [String],
      default: ["single", "jodi"]
    },

    // ✅ payout for gali only
    payout: {
      single: { type: Number, default: 9 },
      jodi: { type: Number, default: 90 }
    },

    // ✅ Today's date stored
    gameDate: {
      type: Date,
      required: true
    },

    // results
openResult: {
  left: { type: String, default: null },
  right: { type: String, default: null },
  jodi: { type: String, default: null }
},

closeResult: {
  left: { type: String, default: null },
  right: { type: String, default: null },
  jodi: { type: String, default: null }
},

    status: {
      type: String,
      default: "running"
    },

    isActive: {
      type: Boolean,
      default: true
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("GaliMatch", GaliMatchSchema);
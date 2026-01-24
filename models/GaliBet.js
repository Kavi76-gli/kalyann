const mongoose = require("mongoose");

const GaliBetSchema = new mongoose.Schema(
  {
    // ✅ user who placed bet
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    // ✅ gali match reference
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GaliMatch",
      required: true
    },

    // ✅ only gali bet types
    betType: {
      type: String,
      enum: ["single", "jodi"],
      required: true
    },

    // ✅ for single: left/right | for jodi: jodi
    betFor: {
      type: String,
      enum: ["left", "right", "jodi"],
      required: true
    },

    // ✅ number can be:
    // single => "0"-"9"
    // jodi   => "00"-"99"
    number: {
      type: String,
      required: true
    },

    // ✅ minimum ₹10
    amount: {
      type: Number,
      required: true,
      min: 10
    },

    // ✅ bet status
    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending"
    },

    // ✅ result status
    resultStatus: {
      type: String,
      enum: ["pending", "won", "lost"],
      default: "pending"
    },

    // ✅ settlement flag
    isSettled: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("GaliBet", GaliBetSchema);

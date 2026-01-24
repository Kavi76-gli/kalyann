const mongoose = require("mongoose");

const paymentConfigSchema = new mongoose.Schema(
  {
    upiId: {
      type: String,
      required: true
    },
    qrImage: {
      type: String // filename
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("paymentConfig", paymentConfigSchema);

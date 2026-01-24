const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },

  otp: String,
  otpExpiry: Date,
  isVerified: {
    type: Boolean,
    default: false
  },

  role: {
    type: String,
    default: "user" // user | admin
  },

  isAdmin: {
  type: Boolean,
  default: false
}
,

referralCode: { type: String, unique: true },
referredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
wallet: { type: Number, default: 0 }
,

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("User", UserSchema);

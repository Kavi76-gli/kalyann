const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  email: String,
  phone: String,
  name: String,
  password: String, // <--- store the password temporarily
  otp: String,
  purpose: String,
  expiresAt: Date
});

// automatically delete expired OTPs
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Otp", otpSchema);

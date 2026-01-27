// 📌 config/payout.js
// Define the payout multipliers for each bet type
// Supports decimal values

module.exports = {
  single: 9.0,       // Open/Close Single
  jodi: 90.0,        // OpenSingle + CloseSingle
  singlepanna: 150.0,
  doublepanna: 300.0,
  triplepanna: 900.0,
  halfSangam: 1000.0, // openPanel-closeSingle OR openSingle-closePanel
  fullSangam: 10000.0 // openPanel-closePanel
};

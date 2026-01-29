const mongoose = require("mongoose");

const cronLogSchema = new mongoose.Schema({
  name: String,
  ranAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("CronLog", cronLogSchema);

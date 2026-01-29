const cron = require("node-cron");
const Match = require("../models/Match");
const GaliMatch = require("../models/GaliMatch");

const GaliBet = require("../models/GaliBet");

cron.schedule("0 3 * * *", async () => {
  console.log("⏰ 3 AM Result Reset Started");

  await Match.updateMany(
    {},
    {
      $set: {
        openResult: null,
        closeResult: null,
        openPayoutDone: false,
        closePayoutDone: false
      }
    }
  );

  console.log("✅ Results reset completed");
}, {
  timezone: "Asia/Kolkata"
});

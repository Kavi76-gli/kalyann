const cron = require("node-cron");

const Match = require("../models/Match");
const GaliMatch = require("../models/GaliMatch");

// ================================
// ⏰ DAILY RESET @ 03:00 AM IST
// ================================
cron.schedule(
  "0 3 * * *",
  async () => {
    try {
      console.log("⏰ 3 AM RESULT RESET STARTED");

      // 🔁 NORMAL MATCH RESET
      await Match.updateMany(
        {},
        {
          $unset: {
            openResult: "",
            closeResult: ""
          },
          $set: {
            openPayoutDone: false,
            closePayoutDone: false
          }
        }
      );

      // 🔁 GALI MATCH RESET
      await GaliMatch.updateMany(
        {},
        {
          $unset: {
            openResult: ""
          },
          $set: {
            resultDeclared: false
          }
        }
      );

      console.log("✅ ALL RESULTS RESET SUCCESSFULLY");

    } catch (err) {
      console.error("❌ CRON RESET ERROR:", err);
    }
  },
  {
    timezone: "Asia/Kolkata"
  }
);

// ================================
// 🔥 TEST CRON (OPTIONAL – DEV ONLY)
// ================================
cron.schedule("* * * * *", () => {
  console.log("🔥 CRON HEARTBEAT OK");
});

const cron = require("node-cron");
const Match = require("../models/Match");

// ================= DAILY RESET @ 3:00 AM IST =================
cron.schedule(
  "0 3 * * *",
  async () => {
    try {
      console.log("🕒 Daily Matka reset started...");

      const result = await Match.updateMany(
        {},
        {
          $set: {
            openResult: "***",
            closeResult: "***",
            isOpenResultDeclared: false,
            isCloseResultDeclared: false,
            updatedAt: new Date()
          }
        }
      );

      console.log(
        `✅ Daily reset completed. Games reset: ${result.modifiedCount}`
      );
    } catch (err) {
      console.error("❌ Daily reset failed:", err);
    }
  },
  {
    timezone: "Asia/Kolkata"
  }
);

module.exports = {};

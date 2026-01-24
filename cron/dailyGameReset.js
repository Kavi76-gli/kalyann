const cron = require("node-cron");
const Match = require("../models/Match");

cron.schedule("0 3 * * *", async () => {
  try {
    console.log("⏰ 3 AM Game Reset Started");

    // Yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    // Today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1️⃣ Close yesterday games
    await Match.updateMany(
      { gameDate: yesterday },
      { isActive: false, status: "completed" }
    );

    // 2️⃣ Get yesterday games
    const oldGames = await Match.find({ gameDate: yesterday });

    // 3️⃣ Create fresh games for today
    const newGames = oldGames.map(game => ({
      gameName: game.gameName,
      gameCode: game.gameCode,
      openTime: game.openTime,
      closeTime: game.closeTime,
      resultTime: game.resultTime,
      minBet: game.minBet,
      maxBet: game.maxBet,
      payout: game.payout,
      allowedTypes: game.allowedTypes,

      openResult: null,
      closeResult: null,

      status: "running",
      isActive: true,
      gameDate: today
    }));

    if (newGames.length) {
      await Match.insertMany(newGames);
    }

    console.log("✅ New day games created successfully");

  } catch (err) {
    console.error("❌ Daily reset error:", err);
  }
});

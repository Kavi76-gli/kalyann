const axios = require("axios");
const cheerio = require("cheerio");
const cron = require("node-cron");

const Match = require("../models/Match");
const { declareOpenResult, declareCloseResult } = require("../controllers/match-controller");

console.log("🔄 DPBoss Auto Result Sync Started...");

const markets = [
  { name: "KALYAN", dbName: "Kalyan" },
  { name: "KALYAN MORNING", dbName: "Kalyan morning" },
  { name: "MAIN", dbName: "Main" },
  { name: "MILAN", dbName: "Milan" }
];

cron.schedule("*/1 * * * *", async () => {
  try {

    const { data } = await axios.get("https://www.mydpboss.com/");
    const $ = cheerio.load(data);
    const text = $("body").text();

    for (let market of markets) {

      const regex = new RegExp(`${market.name}\\s+(\\d{3})-(\\d{2})-(\\d{3})`);
      const match = text.match(regex);

      if (!match) continue;

      const openPanel = match[1];
      const jodi = match[2];
      const closePanel = match[3];

      const openSingle =
        openPanel.split("").reduce((a,b)=>+a+ +b) % 10;

      const closeSingle =
        closePanel.split("").reduce((a,b)=>+a+ +b) % 10;

      const matchDoc = await Match.findOne({ name: market.dbName });

      if (!matchDoc) continue;

      // ================= OPEN RESULT =================

      if (!matchDoc.openResult || matchDoc.openResult.single === "***") {

        await declareOpenResult(
          {
            body: {
              matchId: matchDoc._id,
              panel: openPanel,
              single: openSingle
            }
          },
          { json: () => {} }
        );

        console.log(`✅ ${market.name} OPEN SYNCED:`, openPanel);
      }

      // ================= CLOSE RESULT =================

      if (!matchDoc.closeResult || matchDoc.closeResult.single === "***") {

        await declareCloseResult(
          {
            body: {
              matchId: matchDoc._id,
              panel: closePanel,
              single: closeSingle
            }
          },
          { json: () => {} }
        );

        console.log(`✅ ${market.name} CLOSE SYNCED:`, closePanel);
      }

    }

  } catch (err) {

    console.log("❌ DPBoss Sync Error:", err.message);

  }
});
const axios = require("axios");
const Match = require("../models/Match");
const { declareOpenResult, declareCloseResult } = require("../controllers/match-controller");

async function fetchResultsFromOtherApp() {

  try {

    console.log("🔍 Fetching results from other app...");

    const res = await axios.get(
      "https://kalyan-2.onrender.com/api/match/gamezone",
      {
        headers: {
          Authorization: `Bearer ${process.env.RESULT_API_TOKEN}`
        }
      }
    );

    if (!res.data || !res.data.success) {
      console.log("⚠ API response invalid");
      return;
    }

    const results = res.data.games;

    if (!results || results.length === 0) {
      console.log("⚠ No games returned from API");
      return;
    }

    const matches = await Match.find({ isActive: true });

    for (const match of matches) {

      const result = results.find(r =>
        r.gameName?.toLowerCase() === match.gameName?.toLowerCase() &&
        r.openTime === match.openTime &&
        r.closeTime === match.closeTime
      );

      if (!result) {
        console.log(`❌ No match for ${match.gameName}`);
        continue;
      }

      console.log(`🎯 Matched game: ${match.gameName}`);

      // ==========================
      // AUTO OPEN RESULT
      // ==========================

      if (
        result.openResult?.single !== null &&
        result.openResult?.single !== undefined &&
        (!match.openResult || match.openResult.single === null)
      ) {

        console.log(`🤖 AUTO OPEN RESULT: ${match.gameName}`);

        await declareOpenResult(
          {
            body: {
              matchId: match._id,
              panel: result.openResult.panel,
              single: result.openResult.single,
              source: "auto"
            }
          },
          dummyRes()
        );
      }

      // ==========================
      // AUTO CLOSE RESULT
      // ==========================

      if (
        result.closeResult?.single !== null &&
        result.closeResult?.single !== undefined &&
        (!match.closeResult || match.closeResult.single === null)
      ) {

        console.log(`🤖 AUTO CLOSE RESULT: ${match.gameName}`);

        await declareCloseResult(
          {
            body: {
              matchId: match._id,
              panel: result.closeResult.panel,
              single: result.closeResult.single,
              source: "auto"
            }
          },
          dummyRes()
        );
      }

    }

  } catch (err) {

    if (err.response) {
      console.log("❌ API error:", err.response.status);
    } else {
      console.log("❌ Error:", err.message);
    }

  }
}

function dummyRes() {
  return {
    status: () => ({ json: () => {} }),
    json: () => {}
  };
}

module.exports = { fetchResultsFromOtherApp };
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
          Authorization: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5NjVlZmZjNDM5NTU0MWJhZjljZGFlZiIsImlzQWRtaW4iOnRydWUsImlhdCI6MTc3MzM5MDE3MiwiZXhwIjoxODA0OTI2MTcyfQ.Mv9VAgMALmJJuWFztZzN0-7V8RRtr6APaDq2A3uTyhs"
        }
      }
    );

    if (!res.data.success) {
      console.log("⚠ API returned success=false");
      return;
    }

    // ⚠ your API returns games
    const results = res.data.games;

    if (!results || results.length === 0) {
      console.log("⚠ No results received");
      return;
    }

    const matches = await Match.find();

    for (const match of matches) {

      const result = results.find(
        r => r.gameName?.toLowerCase() === match.gameName?.toLowerCase()
      );

      if (!result) continue;

      // =================
      // AUTO OPEN RESULT
      // =================

      if (
        result.openResult?.single &&
        (!match.openResult || match.openResult.single === "***")
      ) {

        console.log("✅ Auto OPEN result:", match.gameName);

        await declareOpenResult(
          {
            body: {
              matchId: match._id,
              panel: result.openResult.panel,
              single: result.openResult.single
            }
          },
          dummyRes()
        );
      }

      // =================
      // AUTO CLOSE RESULT
      // =================

      if (
        result.closeResult?.single &&
        (!match.closeResult || match.closeResult.single === "***")
      ) {

        console.log("✅ Auto CLOSE result:", match.gameName);

        await declareCloseResult(
          {
            body: {
              matchId: match._id,
              panel: result.closeResult.panel,
              single: result.closeResult.single
            }
          },
          dummyRes()
        );
      }

    }

  } catch (err) {

    if (err.response) {
      console.log("❌ Fetch result error:", err.response.status);
    } else {
      console.log("❌ Fetch result error:", err.message);
    }

  }
}

// Fake response for controller calls
function dummyRes() {
  return {
    status: () => ({ json: () => {} }),
    json: () => {}
  };
}

module.exports = { fetchResultsFromOtherApp };
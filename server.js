const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const cron = require("node-cron");
const replayDailyGames = require("./cron/dailyGameReset");

require("dotenv").config();

const app = express();

// CORS Configuration
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true); // allow requests from APK (no origin)
    return callback(null, true); // allow all origins
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));



// ⏰ Run daily at 4:01 AM
cron.schedule("1 4 * * *", async () => {
  console.log("🔁 Running daily game replay...");
  await replayDailyGames();
});

// Middleware
app.use(express.json());

// Serve static frontend if needed
app.use(express.static(path.join(__dirname, "frontend/public")));

// Serve uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// server.js
const authRoutes = require("./routes/auth");
app.use("/", authRoutes); // referral route registered AFTER static

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend/public/auth.html"));
});


app.use("/api/auth", require("./routes/auth"));
app.use("/api/match", require("./routes/match"));
app.use("/api/admin", require("./routes/adminBidroutes"));
app.use("/api/gali", require("./routes/gali"));   // ✅ GALI DISAWAR ROUTES
app.use("/api/gali-bet", require("./routes/gali-bet"));
require("./services/dpbossSync");
// MongoDB + Server Start
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () =>
      console.log(`Server running on port ${PORT}`)
    );
  })
  .catch(err => console.error(err)); 
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
    if (!origin) return callback(null, true); // mobile apps send no origin
    if (allowedOrigins.includes(origin) || origin === "*") return callback(null, true);
    return callback(new Error(`CORS policy: ${origin} not allowed`), false);
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

// Routes
app.get("/", (req, res) => {
  res.send("Number App Backend Running 🚀");
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/match", require("./routes/match"));
app.use("/api/admin", require("./routes/adminBidroutes"));
app.use("/api/gali", require("./routes/gali"));   // ✅ GALI DISAWAR ROUTES
app.use("/api/gali-bet", require("./routes/gali-bet"));

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
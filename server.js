const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const cron = require("node-cron");
const replayDailyGames = require("./cron/dailyGameReset");

require("dotenv").config();

const app = express();

// ✅ CORS Configuration
// Allow your frontend origin for development
const allowedOrigins = [
  "http://127.0.0.1:5500", // VSCode Live Server or local dev
  "http://localhost:5500",  // Alternative localhost
  "https://your-frontend-domain.com" // Production frontend
];

app.use(cors({
  origin: function(origin, callback){
    // Allow requests with no origin (like Postman)
    if(!origin) return callback(null, true);
    if(allowedOrigins.indexOf(origin) === -1){
      const msg = `CORS policy: ${origin} not allowed`;
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET","POST","PUT","DELETE","OPTIONS"]
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

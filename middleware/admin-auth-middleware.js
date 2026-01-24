const jwt = require("jsonwebtoken");
const User = require("../models/User");

// =====================
// AUTH (LOGIN REQUIRED)
// =====================
exports.auth = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ msg: "No token, authorization denied" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ msg: "User not found" });
    }

    req.user = user; // 🔥 attach full user
    next();
  } catch (err) {
    console.error("Auth Middleware:", err.message);
    res.status(401).json({ msg: "Token is not valid" });
  }
};

// =====================
// ADMIN ONLY
// =====================
exports.adminOnly = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ msg: "Unauthorized" });
    }

    if (!req.user.isAdmin) {
      return res.status(403).json({ msg: "Access denied: Admins only" });
    }

    next();
  } catch (err) {
    console.error("Admin Middleware:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
};

 const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Otp = require("../models/Otp"); 
const genOtp = require("../utils/genOtp");
const sendEmail = require("../utils/sendEmail");
const Wallet = require("../models/wallet");
const PaymentConfig = require("../models/PaymentConfig");

const fs = require("fs");
const multer = require("multer");
const path = require("path");

// ------------------------------
// Multer setup (reusable for withdrawals & QR uploads)
// ------------------------------
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadDir = path.join(process.cwd(), "uploads", "screenshots");
    if (file.fieldname === "screenshot" || file.fieldname === "qrImage") {
      uploadDir = path.join(process.cwd(), "uploads/qr");
    } else if (file.fieldname === "avatar") {
      uploadDir = path.join(process.cwd(), "uploads/avatars");
    }
    ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

exports.upload = multer({ storage }); 
const generateReferralCode = (name = "REF") => {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return name.substring(0, 3).toUpperCase() + rand;
};

// use in routes: upload.single("screenshot")
/* ======================================
   REGISTER → SEND EMAIL OTP
====================================== */
/* ======================================
   REGISTER → SEND EMAIL OTP
====================================== */
exports.registerSendOtp = async (req, res) => {
  try {
    const { name, phone, email, password, confirmPassword, referralCode } = req.body;

    // ✅ Required fields check
    if (!name || !phone || !email || !password || !confirmPassword) {
      return res.status(400).json({ success: false, msg: "All fields required" });
    }

    // ✅ Password match
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, msg: "Passwords do not match" });
    }

    // ✅ Existing user check
    const exists = await User.findOne({ $or: [{ phone }, { email }] });
    if (exists) {
      return res.status(400).json({ success: false, msg: "User already exists" });
    }

    // ✅ Validate referral code if provided
    let referrerUser = null;
    if (referralCode && referralCode.trim() !== "") {
      referrerUser = await User.findOne({ referralCode: referralCode.trim() });

      if (!referrerUser) {
        return res.status(400).json({ success: false, msg: "Invalid referral code" });
      }
    }

    // ✅ Generate OTP
    const otp = genOtp();

    // ✅ Remove old OTP entries for this email
    await Otp.deleteMany({ email, purpose: "register" });

    // ✅ Save OTP record
    await Otp.create({
      name,
      phone,
      email,
      password, // temporarily stored (you can encrypt if you want)
      otp,
      referralCode: referralCode ? referralCode.trim() : null,
      purpose: "register",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    });

    // ✅ Send email OTP
    await sendEmail({
      to: email,
      subject: "KALYAN MASTER Registration OTP",
      html: `<h2>Hello ${name}, your OTP is: <b>${otp}</b></h2>`
    });

    return res.json({ success: true, msg: "OTP sent to your email" });

  } catch (err) {
    console.error("registerSendOtp:", err);
    return res.status(500).json({ success: false, msg: "Failed to send OTP" });
  }
};
exports.verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // ✅ Validate input
    if (!email || !otp) {
      return res.status(400).json({ success: false, msg: "Email and OTP required" });
    }

    // ✅ Find OTP record
    const record = await Otp.findOne({ email, otp, purpose: "register" });

    if (!record) {
      return res.status(400).json({ success: false, msg: "Invalid OTP" });
    }

    // ✅ Expiry check
    if (record.expiresAt < Date.now()) {
      await Otp.deleteMany({ email, purpose: "register" });
      return res.status(400).json({ success: false, msg: "OTP expired. Register again." });
    }

    // ✅ Double check user does not already exist
    const exists = await User.findOne({ $or: [{ phone: record.phone }, { email: record.email }] });
    if (exists) {
      await Otp.deleteMany({ email, purpose: "register" });
      return res.status(400).json({ success: false, msg: "User already exists. Please login." });
    }

    // ✅ Hash password
    const hashedPassword = await bcrypt.hash(record.password, 10);

    // ✅ Generate unique referral code for new user
    let myReferralCode = generateReferralCode(record.name);
    while (await User.findOne({ referralCode: myReferralCode })) {
      myReferralCode = generateReferralCode(record.name);
    }

    // ✅ If referral code exists find referrer
    let referrerUser = null;
    if (record.referralCode) {
      referrerUser = await User.findOne({ referralCode: record.referralCode });
    }

    // ✅ Wallet bonus
    const newUserBonus = referrerUser ? 40 : 0; // new user gets ₹40 if referral used

    // ✅ Create new user
    const newUser = await User.create({
      name: record.name,
      phone: record.phone,
      email: record.email,
      password: hashedPassword,
      referralCode: myReferralCode,
      referredBy: referrerUser ? referrerUser._id : null,
      wallet: newUserBonus
    });

    // ✅ Give referrer ₹50 bonus
    if (referrerUser) {
      referrerUser.wallet = Number(referrerUser.wallet || 0) + 50;
      await referrerUser.save();
    }

    // ✅ Remove OTP record
    await Otp.deleteMany({ email, purpose: "register" });

    return res.json({
      success: true,
      msg: "Registration successful ✅",
      userId: newUser._id,
      referralBonus: referrerUser ? true : false
    });

  } catch (err) {
    console.error("verifyEmailOtp:", err);
    return res.status(500).json({ success: false, msg: "OTP verification failed" });
  }
};


/* ======================================
   LOGIN
====================================== */
exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ msg: "Phone and password required" });
    }

    const user = await User.findOne({ phone }).select("+password");
    if (!user) {
      return res.status(400).json({ msg: "User not found" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ msg: "Wrong password" });
    }

    const token = jwt.sign(
      { id: user._id, isAdmin: user.isAdmin === true },
      process.env.JWT_SECRET,
      { expiresIn: "365d" }
    );

    res.json({
      success: true,
      token,
      isAdmin: user.isAdmin === true,
      redirect: "/profile.html"   // 👈 frontend will use this
    });

  } catch (err) {
    console.error("login:", err);
    res.status(500).json({ msg: "Login failed" });
  }
};

/* ======================================
   FORGOT PASSWORD → SEND OTP
====================================== */
exports.forgotSendOtp = async (req, res) => {
  try {
    const { phone, email } = req.body;

    const user = await User.findOne({ phone, email });
    if (!user)
      return res.status(400).json({ msg: "User not found" });

    const otp = genOtp();

    await Otp.deleteMany({ email, purpose: "forgot" });

    await Otp.create({
      email,
      phone,
      otp,
      purpose: "forgot",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });

    await sendEmail({
      to: email,
      subject: "Password Reset OTP",
      html: `<h2>Your OTP is <b>${otp}</b></h2>`
    });

    res.json({ success: true, msg: "OTP sent to email" });
  } catch (err) {
    console.error("forgotSendOtp:", err);
    res.status(500).json({ msg: "Failed to send OTP" });
  }
};

/* ======================================
   FORGOT PASSWORD → RESET
====================================== */
exports.forgotReset = async (req, res) => {
  try {
    const { phone, email, otp, newPassword } = req.body;

    if (!newPassword)
      return res.status(400).json({ msg: "New password required" });

    const record = await Otp.findOne({
      email,
      phone,
      otp,
      purpose: "forgot"
    });

    if (!record || record.expiresAt < Date.now())
      return res.status(400).json({ msg: "Invalid or expired OTP" });

    const hashed = await bcrypt.hash(newPassword, 10);

    await User.updateOne(
      { phone, email },
      { password: hashed }
    );

    await Otp.deleteMany({ email, purpose: "forgot" });

    res.json({ success: true, msg: "Password updated successfully" });
  } catch (err) {
    console.error("forgotReset:", err);
    res.status(500).json({ msg: "Password reset failed" });
  }
};

/* ======================================
   RESEND OTP (SAFE VERSION)
====================================== */
exports.resendOtp = async (req, res) => {
  try {
    const { email, purpose } = req.body;

    if (!email || !purpose)
      return res.status(400).json({ msg: "Email and purpose required" });

    // Try to find old OTP
    const oldOtp = await Otp.findOne({ email, purpose });

    const otp = genOtp();

    // Delete previous OTPs for this email/purpose (if any)
    await Otp.deleteMany({ email, purpose });

    // Create new OTP record
    await Otp.create({
      email,
      phone: oldOtp?.phone || "", // use phone if exists
      name: oldOtp?.name || "",   // use name if exists
      password: oldOtp?.password || "", // use password if exists
      otp,
      purpose,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    });

    // Send OTP via email
    await sendEmail({
      to: email,
      subject: "Your OTP",
      html: `<h2>Your OTP is <b>${otp}</b></h2><p>Valid for 5 minutes</p>`
    });

    res.json({ success: true, msg: "OTP sent successfully" });
  } catch (err) {
    console.error("resendOtp:", err);
    res.status(500).json({ msg: "Failed to send OTP" });
  }
};

/* ======================================
   MAKE USER ADMIN
====================================== */
exports.makeAdmin = async (req, res) => {
  try {
    const { phone, email } = req.body;

    // ✅ Validation
    if (!phone || !email) {
      return res.status(400).json({
        msg: "Phone and email are required"
      });
    }

    // ✅ Find user using BOTH phone & email
    const user = await User.findOne({ phone, email });

    if (!user) {
      return res.status(404).json({
        msg: "User not found with given phone and email"
      });
    }

    // ✅ Already admin check
    if (user.isAdmin === true) {
      return res.status(400).json({
        msg: "User is already an admin"
      });
    }

    // ✅ Make admin
    user.isAdmin = true;
    await user.save();

    res.json({
      success: true,
      msg: `${phone} (${email}) is now an admin`
    });

  } catch (err) {
    console.error("makeAdmin:", err);
    res.status(500).json({
      msg: "Server error"
    });
  }
};

// ======================
// Multer setup for avatar uploads
// ======================

/* ======================================
   ADMIN → GET ALL REGISTERED USERS
====================================== */
/* ======================================
   ADMIN → GET ALL REGISTERED USERS
====================================== */
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find() // no select "-password", include password
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      total: users.length,
      users
    });
  } catch (err) {
    console.error("getAllUsers:", err);
    res.status(500).json({ msg: "Server error" });
  }
};
/* ======================================
   ADMIN → BAN USER
====================================== */
exports.banUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    user.isBanned = true;
    await user.save();

    res.json({ success: true, msg: `${user.name} has been banned.` });
  } catch (err) {
    console.error("banUser:", err);
    res.status(500).json({ msg: "Server error" });
  }
};
/* ======================================
   ADMIN → UNBAN USER
====================================== */
exports.unbanUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    user.isBanned = false;
    await user.save();

    res.json({ success: true, msg: `${user.name} has been unbanned.` });
  } catch (err) {
    console.error("unbanUser:", err);
    res.status(500).json({ msg: "Server error" });
  }
};
/* ======================================
   ADMIN → RESET USER PASSWORD
====================================== */
exports.resetUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) return res.status(400).json({ msg: "New password required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.json({ success: true, msg: `${user.name}'s password has been reset.` });
  } catch (err) {
    console.error("resetUserPassword:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

// ======================
// Multer setup for avatar uploads
// ======================







// ======================
// Get user profile
// ======================
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        msg: "User not found"
      });
    }

    const BASE_URL = process.env.BASE_URL || "https://kalyann.onrender.com";

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name || "Player",
        phone: user.phone,
        email: user.email,

        // ✅ return filename
        avatar: user.avatar || null,

        // ✅ return full URL
        avatarUrl: user.avatar
          ? `${BASE_URL}/uploads/avatars/${user.avatar}`
          : null,

        isAdmin: user.isAdmin,
      },
      dashboard: user.isAdmin ? "Admin Area" : "User Area",
    });

  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({
      success: false,
      msg: "Server error"
    });
  }
};


exports.getBalance = async (req, res) => {
  try {
    // Find wallet for logged-in user
    let wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) {
      // If no wallet exists, create one with 0 balance
      wallet = await Wallet.create({ userId: req.user.id, balance: 0 });
    }

    res.json({
      success: true,
      balance: wallet.balance
    });
  } catch (err) {
    console.error("getBalance:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

// ======================
// Logout
// ======================
/* ======================================
   USER → LOGOUT
====================================== */
/* ======================================
   USER → CHANGE PASSWORD
====================================== */
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword)
      return res.status(400).json({ msg: "Both old and new passwords are required" });

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Compare old password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ msg: "Old password is incorrect" });

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ success: true, msg: "Password updated successfully" });
  } catch (err) {
    console.error("changePassword:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

/* ======================================
   USER → UPDATE CONTACT INFO
====================================== */
exports.updateContact = async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: "User not found" });

    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (email) user.email = email;

    await user.save();
    res.json({ success: true, msg: "Contact info updated", user });
  } catch (err) {
    console.error("updateContact:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

/* ======================================
   USER → HELP / CONTACT
====================================== */
exports.getHelp = async (req, res) => {
  try {
    // Example static help info
    const helpData = {
      supportEmail: "support@battlepurse.com",
      faqLink: "https://battlepurse.com/faq",
      contactNumber: "+91 8955099474"
    };
    res.json({ success: true, help: helpData });
  } catch (err) {
    console.error("getHelp:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

/* ======================================
   USER → LOGOUT
====================================== */
exports.logout = async (req, res) => {
  try {
    res.json({ success: true, msg: "Logged out successfully" });
  } catch (err) {
    console.error("logout:", err);
    res.status(500).json({ msg: "Server error" });
  }
};



// ======================
// Upload Avatar
// ======================
 // ======================
// Upload Avatar
// ======================
exports.uploadUserAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        msg: "No file uploaded"
      });
    }

    // Save filename in DB
    await User.updateOne(
      { _id: req.user.id },
      { $set: { avatar: req.file.filename } }
    );

    const avatarUrl = `${process.env.BASE_URL || "https://kalyann.onrender.com"}/uploads/avatars/${req.file.filename}`;

    res.json({
      success: true,
      msg: "Avatar uploaded successfully",
      avatar: req.file.filename,
      avatarUrl
    });

  } catch (err) {
    console.error("Avatar upload error:", err);
    res.status(500).json({
      success: false,
      msg: "Server error"
    });
  }
};


// ======================
// Update Profile (including game UIDs)
// ======================
exports.updateProfile = async (req, res) => {
  const { name, freeFire, bgmi, candy, carrom, ludo, eightBall } = req.body;
  try {
    const update = {
      ...(name && { name }),
      uids: { freeFire, bgmi, candy, carrom, ludo, eightBall },
    };

    const user = await User.findByIdAndUpdate(req.user.id, update, { new: true });
    res.json({ msg: "Profile updated successfully", user });
  } catch (err) {
    console.error("Profile Update Error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};  




/* ======================================
   DELETE SINGLE DEPOSIT PERMANENTLY
====================================== */
// controllers/authController.js

// HIDE single deposit from admin view
exports.hideSingleDepositAdminView = async (req, res) => {
  try {
    const { userId, txnId } = req.body; // note: use body, not params

    if (!userId || !txnId) {
      return res.status(400).json({ success: false, msg: "userId and txnId required" });
    }

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) return res.status(404).json({ success: false, msg: "Wallet not found" });

    const txn = wallet.transactions.id(txnId);
    if (!txn || txn.type !== "deposit") {
      return res.status(404).json({ success: false, msg: "Deposit not found" });
    }

    // ✅ Hide from admin only
    txn.adminHidden = true;
    await wallet.save();

    res.json({ success: true, msg: "Deposit hidden from admin view" });

  } catch (err) {
    console.error("hideSingleDepositAdminView:", err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// HIDE all deposits from admin view
exports.hideAllDepositsAdminView = async (req, res) => {
  try {
    const wallets = await Wallet.find();

    for (const wallet of wallets) {
      wallet.transactions.forEach(txn => {
        if (txn.type === "deposit") txn.adminHidden = true;
      });
      await wallet.save();
    }

    res.json({ success: true, msg: "All deposits hidden from admin view" });

  } catch (err) {
    console.error("hideAllDepositsAdminView:", err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};


// DELETE single deposit permanently
exports.deleteSingleDeposit = async (req, res) => {
  try {
    const { id } = req.params;

    const wallets = await Wallet.find();
    let found = false;

    for (const wallet of wallets) {
      const txn = wallet.transactions.id(id);
      if (txn && txn.type === "deposit") {
        txn.remove(); // permanently delete
        await wallet.save();
        found = true;
        break;
      }
    }

    if (!found) return res.status(404).json({ success: false, msg: "Deposit not found" });

    res.json({ success: true, msg: "Deposit deleted successfully" });
  } catch (err) {
    console.error("deleteSingleDeposit:", err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// DELETE all deposits permanently
exports.deleteAllDeposits = async (req, res) => {
  try {
    const wallets = await Wallet.find();

    for (const wallet of wallets) {
      wallet.transactions = wallet.transactions.filter(txn => txn.type !== "deposit");
      await wallet.save();
    }

    res.json({ success: true, msg: "All deposits deleted successfully" });
  } catch (err) {
    console.error("deleteAllDeposits:", err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};



exports.depositRequest = async (req, res) => {
  try {
    const { amount, utr } = req.body;

    if (!amount || amount <= 0 || !utr) {
      return res.status(400).json({ msg: "Amount and UTR required" });
    }

    let wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) {
      wallet = await Wallet.create({ userId: req.user.id, balance: 0 });
    }

    // ❌ Block duplicate UTR
    const exists = wallet.transactions.find(t => t.utr === utr);
    if (exists) {
      return res.status(400).json({ msg: "UTR already used" });
    }

    let screenshot = null;
    if (req.file) {
      screenshot = `/uploads/${req.file.filename}`;
    }

    wallet.transactions.push({
      type: "deposit",
      amount: Number(amount),
      utr,
      screenshot,
      status: "pending"
    });

    await wallet.save();

    res.json({
      success: true,
      msg: "Deposit request submitted, waiting for admin approval"
    });

  } catch (err) {
    console.error("depositRequest:", err);
    res.status(500).json({ msg: "Server error" });
  }
};
/* ======================================
   ADMIN → APPROVE / REJECT DEPOSIT
====================================== */
exports.adminApproveDeposit = async (req, res) => {
  try {
    // ✅ Ensure request body exists
    if (!req.body) {
      return res.status(400).json({ msg: "Request body missing" });
    }

    let { userId, txnId, approve } = req.body;

    // ✅ Validate IDs
    if (!userId || !txnId) {
      return res.status(400).json({ msg: "userId and txnId required" });
    }

    // Ensure approve is boolean
    approve = (approve === true || approve === "true");

    // ✅ Find wallet by userId
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) return res.status(404).json({ msg: "Wallet not found" });

    // ✅ Find transaction
    const txn = wallet.transactions.id(txnId);
    if (!txn) return res.status(404).json({ msg: "Transaction not found" });

    // ✅ Only allow pending transactions
    if (txn.status !== "pending") {
      return res.status(400).json({ msg: "Transaction already processed" });
    }

    // ✅ Approve or reject
    if (approve) {
      txn.status = "approved";
      wallet.balance += Number(txn.amount); // Add to wallet balance
    } else {
      txn.status = "rejected";
    }

    // ✅ Save wallet
    await wallet.save();

    // ✅ Return success and updated info
    res.json({
      success: true,
      balance: wallet.balance,
      txnId: txn._id,
      status: txn.status,
    });

  } catch (err) {
    console.error("adminApproveDeposit:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

exports.getAllDeposits = async (req, res) => {
  try {
    const wallets = await Wallet.find()
      .populate("userId", "name phone email");

    let deposits = [];

    wallets.forEach(wallet => {
      wallet.transactions.forEach(txn => {
        if (txn.type === "deposit") {
          deposits.push({
            txnId: txn._id,
            user: wallet.userId,
            amount: txn.amount,
            utr: txn.utr,
            status: txn.status,
            screenshot: txn.screenshot
              ? `${process.env.BASE_URL || "https://kalyann.onrender.com"}${txn.screenshot}`
              : null,
            date: txn.createdAt
          });
        }
      });
    });

    // ⏱️ SORT BY DATE & TIME (LATEST FIRST)
    deposits.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      total: deposits.length,
      deposits
    });

  } catch (err) {
    console.error("getAllDeposits:", err);
    res.status(500).json({ msg: "Server error" });
  }
};



/* ======================================
   USER → REQUEST WITHDRAWAL
====================================== */
/* ======================================
   USER → REQUEST WITHDRAWAL (Bank / UPI / QR)
====================================== */

/* ======================================
   USER → REQUEST WITHDRAWAL
====================================== */
/* ======================================
   USER → REQUEST WITHDRAWAL (FIXED)
====================================== */
// Withdrawal request
exports.requestWithdrawal = async (req, res) => {
  try {
    const { amount, method, upiId, name, account, ifsc } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ msg: "Invalid amount" });
    if (!["bank","upi","qr"].includes(method)) return res.status(400).json({ msg: "Invalid method" });

    if (method === "bank" && (!name || !account || !ifsc))
      return res.status(400).json({ msg: "Complete bank details required" });
    if (method === "upi" && !upiId)
      return res.status(400).json({ msg: "UPI ID required" });
    if (method === "qr" && !req.file)
      return res.status(400).json({ msg: "QR screenshot is required" });

    const wallet = await Wallet.findOne({ userId: req.user.id });
    if (!wallet) return res.status(404).json({ msg: "Wallet not found" });
    if (wallet.balance < amount) return res.status(400).json({ msg: "Insufficient balance" });

    const withdrawalTxn = {
      type: "withdraw",
      amount,
      method,
      bankDetails: method==="bank" ? { name, account, ifsc } : null,
      upiId: method==="upi" ? upiId : null,
      screenshot: method==="qr" ? req.file.filename : null,
      status: "pending",
      createdAt: new Date()
    };

    wallet.balance -= amount;
    wallet.transactions.push(withdrawalTxn);
    await wallet.save();

    res.json({ success: true, msg: "Withdrawal request submitted" });
  } catch (err) {
    console.error("requestWithdrawal:", err);
    res.status(500).json({ msg: "Server error" });
  }
};


exports.getPendingWithdrawals = async (req, res) => {
  try {
    const wallets = await Wallet.find({ "transactions.type": "withdraw", "transactions.status": "pending" })
      .populate("userId", "name phone email");

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const pending = [];

    wallets.forEach(wallet => {
      wallet.transactions.forEach(txn => {
        if (txn.type === "withdraw" && txn.status === "pending") {
          pending.push({
            transactionId: txn._id,
            userId: wallet.userId._id,
            user: wallet.userId,
            amount: txn.amount,
            method: txn.method,
            bank: txn.bankDetails || null,
            upiId: txn.upiId || null,
            screenshot: txn.screenshot ? `${baseUrl}/uploads/qr/${txn.screenshot}` : null,
            status: txn.status,
            createdAt: txn.createdAt
          });
        }
      });
    });

    res.json({ success: true, total: pending.length, pending });
  } catch (err) {
    console.error("getPendingWithdrawals:", err);
    res.status(500).json({ msg: "Server error" });
  }
};




// ===================== HANDLE WITHDRAWAL (APPROVE/REJECT) =====================
exports.handleWithdrawal = async (req, res) => {
  try {
    const { userId, transactionId, action } = req.body;

    if (!["approve", "reject"].includes(action))
      return res.status(400).json({ msg: "Invalid action" });

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) return res.status(404).json({ msg: "Wallet not found" });

    const txn = wallet.transactions.id(transactionId);
    if (!txn || txn.type !== "withdraw")
      return res.status(404).json({ msg: "Transaction not found" });

    if (txn.status !== "pending")
      return res.status(400).json({ msg: "Already processed" });

    if (action === "approve") {
      txn.status = "approved";
      // Do not deduct again, balance already deducted when request was created
    }

    if (action === "reject") {
      txn.status = "rejected";
      wallet.balance += txn.amount; // Refund
    }

    await wallet.save();

    res.json({
      success: true,
      msg: `Withdrawal ${action}ed successfully`,
      balance: wallet.balance
    });

  } catch (err) {
    console.error("handleWithdrawal:", err);
    res.status(500).json({ msg: "Server error" });
  }
};





/* ======================================
   ADMIN → GET ALL USERS + BALANCES
====================================== */
exports.getAllUsersWallet = async (req, res) => {
  try {
    const users = await User.find().select("name phone email isAdmin");
    const wallets = await Wallet.find();

    const data = users.map(user => {
      const wallet = wallets.find(w => w.userId.toString() === user._id.toString());
      return {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        isAdmin: user.isAdmin,
        balance: wallet ? wallet.balance : 0
      };
    });

    res.json({ success: true, users: data });
  } catch (err) {
    console.error("getAllUsersWallet:", err);
    res.status(500).json({ msg: "Server error" });
  }
};
/* ======================================
   ADMIN → UPDATE USER WALLET BALANCE
====================================== */
exports.adminUpdateBalance = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount } = req.body; // amount can be positive or negative

    if (amount === undefined || isNaN(amount)) {
      return res.status(400).json({ msg: "Valid amount is required" });
    }

    // Find or create wallet
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) wallet = await Wallet.create({ userId, balance: 0 });

    // Record transaction
    wallet.transactions.push({
      type: "admin_update",
      amount: Number(amount),
      status: "approved"
    });

    // Update balance
    wallet.balance += Number(amount);
    if (wallet.balance < 0) wallet.balance = 0; // Prevent negative balance

    await wallet.save();

    res.json({
      success: true,
      msg: `Wallet updated successfully. New balance: ${wallet.balance}`,
      balance: wallet.balance
    });
  } catch (err) {
    console.error("adminUpdateBalance:", err);
    res.status(500).json({ msg: "Server error" });
  }
};




exports.adminUpdatePayment = async (req, res) => {
  try {
    const { upiId } = req.body;
    if (!upiId) return res.status(400).json({ msg: "UPI ID required" });

    let qrImage = null;
    if (req.file) qrImage = req.file.filename; // uploaded file

    // Only one payment config → upsert
    let config = await PaymentConfig.findOne();
    if (!config) {
      config = await PaymentConfig.create({
        upiId,
        qrImage,
        updatedBy: req.user.id
      });
    } else {
      config.upiId = upiId;
      if (qrImage) config.qrImage = qrImage;
      config.updatedBy = req.user.id;
      await config.save();
    }

    res.json({ success: true, msg: "Payment config updated", config });
  } catch (err) {
    console.error("adminUpdatePayment:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

exports.getPaymentDetails = async (req, res) => {
  try {
    const config = await PaymentConfig.findOne();
    if (!config)
      return res.status(404).json({ msg: "Payment info not set" });

    // Build full URL dynamically
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    res.json({
      success: true,
      upiId: config.upiId,
      qrImage: config.qrImage
        ? `${baseUrl}/uploads/qr/${config.qrImage}`
        : null
    });
  } catch (err) {
    console.error("getPaymentDetails:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

/* ======================================
   USER → GET OWN TRANSACTIONS
====================================== */
exports.getUserTransactions = async (req, res) => {
  const wallet = await Wallet.findOne({ userId: req.user.id }).lean();
  if (!wallet) return res.json({ success: true, transactions: [] });

  res.json({
    success: true,
    transactions: wallet.transactions.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    )
  });
};

exports.getMyTransactions = async (req, res) => {
  try {
    const wallet = await Wallet.findOne(
      { userId: req.user.id },
      { balance: 1, transactions: 1 }
    ).lean(); // ✅ plain JS object

    if (!wallet) {
      return res.json({
        success: true,
        balance: 0,
        transactions: []
      });
    }

    // Clone + sort descending by createdAt
    const transactions = [...(wallet.transactions || [])]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(tx => {
        // Determine type and format amount
        let displayAmount = tx.amount;
        let typeLabel = "Transaction";

        if (tx.type === "deposit") {
          displayAmount = `+₹${tx.amount}`;
          typeLabel = "Deposit";
        } else if (tx.type === "withdrawal") {
          displayAmount = `-₹${tx.amount}`;
          typeLabel = "Withdrawal";
        } else if (tx.type === "bet") {
          displayAmount = `-₹${tx.amount}`;
          typeLabel = "Bet Placed";
        } else if (tx.type === "win") {
          displayAmount = `+₹${tx.amount}`;
          typeLabel = "Winning";
        }

        return {
          ...tx,
          displayAmount,
          typeLabel
        };
      });

    return res.json({
      success: true,
      balance: wallet.balance,
      total: transactions.length,
      transactions
    });

  } catch (err) {
    console.error("getMyTransactions:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

/* ======================================
   ADMIN → GET ALL TRANSACTIONS
====================================== */
exports.getAllTransactions = async (req, res) => {
  try {
    const wallets = await Wallet.find()
      .populate("userId", "name phone email")
      .sort({ updatedAt: -1 });

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const transactions = [];

    wallets.forEach(wallet => {
      if (!wallet.userId) return;

      wallet.transactions.forEach(txn => {
        transactions.push({
          transactionId: txn._id,
          user: {
            id: wallet.userId._id,
            name: wallet.userId.name,
            phone: wallet.userId.phone,
            email: wallet.userId.email
          },
          type: txn.type,                // deposit / withdraw
          amount: txn.amount,
          status: txn.status,            // pending / approved / rejected
          method: txn.method || null,    // bank / upi / qr
          utr: txn.utr || null,
          screenshot: txn.screenshot
            ? `${baseUrl}/uploads/qr/${txn.screenshot}`
            : null,
          createdAt: txn.createdAt
        });
      });
    });

    // Latest first
    transactions.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return res.json({
      success: true,
      total: transactions.length,
      transactions
    });
  } catch (err) {
    console.error("getAllTransactions:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};




exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("name phone email wallet referralCode");

    if (!user) return res.status(404).json({ success: false, msg: "User not found" });

    res.json({
      success: true,
      user: {
        name: user.name,
        phone: user.phone,
        email: user.email,
        wallet: user.wallet || 0,
        referralCode: user.referralCode || "----"
      }
    });
  } catch (err) {
    console.error("getMe:", err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};


exports.getMyReferrals = async (req, res) => {
  try {
    const myUserId = req.user.id;

    // all users who registered using my code (referredBy = myUserId)
    const referrals = await User.find({ referredBy: myUserId })
      .select("name phone createdAt")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      totalReferrals: referrals.length,
      totalEarning: referrals.length * 50, // ✅ each referral gives ₹50
      referrals
    });
  } catch (err) {
    console.error("getMyReferrals:", err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};
// authController.js

// controllers/authController.js


// authController.js
exports.referralRedirect = (req, res) => {
  const code = req.params.code;

  // Only allow alphanumeric codes (adjust regex if needed)
  if (!/^[A-Z0-9]+$/.test(code)) {
    return res.status(404).send("Invalid referral code");
  }

  console.log("Referral code:", code);

  const filePath = path.join(__dirname, "../../frontend/public/auth.html");
  res.sendFile(filePath, err => {
    if (err) {
      console.error("Error sending auth.html:", err);
      res.status(404).send("Page not found");
    }
  });
};

// Example: Node.js + Express + Mongoose
exports.approveDeposit = async (req, res) => {
  const { userId, txnId, approve } = req.body;

  try {
    // Find the deposit by ID and user
    const deposit = await Deposit.findOne({ _id: txnId, "user._id": userId });
    if (!deposit) return res.status(404).json({ success: false, msg: "Deposit not found" });

    // Update status permanently
    deposit.status = approve ? "approved" : "rejected";
    await deposit.save();

    // Optionally, if approved, update user wallet
    if (approve) {
      const user = await User.findById(userId);
      if (user) {
        user.balance += deposit.amount;
        await user.save();
      }
    }

    return res.json({ success: true, msg: `Deposit ${approve ? "approved" : "rejected"}` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, msg: "Server error" });
  }
};

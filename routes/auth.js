const express = require("express");
const router = express.Router();

// Controllers
const authController = require("../controllers/auth-controller");




// Middlewares
const { auth } = require("../middleware/auth-middleware");
const { protect } = require("../middleware/auth-middleware");

const { adminOnly } = require("../middleware/admin-auth-middleware");

// Multer uploads
const upload = require("../middleware/upload-middleware"); 
const uploadQR = require("../middleware/uploadQr");

/* =========================
   PUBLIC ROUTES
========================= */
router.post("/register-send-otp", authController.registerSendOtp);
router.post("/verify-email-otp", authController.verifyEmailOtp);
router.post("/login", authController.login);
router.post("/forgot-send-otp", authController.forgotSendOtp);
router.post("/forgot-reset", authController.forgotReset);
router.post("/resend-otp", authController.resendOtp);
router.post("/admin/deposit/remove-one", authController.adminRemoveSingleDepositView);
router.post("/admin/deposit/remove-all", authController.adminRemoveAllDepositsView);

/* =========================
   AUTHENTICATED USER ROUTES
========================= */
router.get("/profile", auth, authController.getProfile);
router.post("/update-profile", auth, authController.updateProfile);

router.post("/uploads-avatars", auth, upload.single("avatar"), authController.uploadUserAvatar);

// Settings Routes
router.post("/settings/change-password", auth, authController.changePassword);
router.post("/settings/update-contact", auth, authController.updateContact);
router.get("/settings/help", auth, authController.getHelp);
router.post("/settings/logout", auth, authController.logout);

/* =========================
   USER → DEPOSIT
========================= */
router.post(
  "/deposit",
  auth,
  upload.single("screenshot"),
  authController.depositRequest
);

/* =========================
   USER → WITHDRAWAL
========================= */
// Example route
// withdraw
router.post(
  "/withdraw",
  auth,
  upload.single("screenshot"),
  authController.requestWithdrawal
);
router.post(
  "/withdraw",
  auth,
  upload.single("screenshot"), // Multer middleware
  authController.requestWithdrawal
);

/* =========================
   USER → GET BALANCE
========================= */
router.get("/balance", auth, authController.getBalance);
// ✅ Get own transactions
router.get(
  "/transactions",
  auth,
  authController.getUserTransactions
);
/* =========================
   ADMIN ROUTES
========================= */

// Make admin
router.post("/make-admin", auth, adminOnly, authController.makeAdmin);

// Ban / Unban user
router.post("/admin/users/ban/:userId", auth, adminOnly, authController.banUser);
router.post("/admin/users/unban/:userId", auth, adminOnly, authController.unbanUser);

// Reset user password
router.post("/admin/users/reset-password/:userId", auth, adminOnly, authController.resetUserPassword);

// Get all users
router.get("/admin/users", auth, adminOnly, authController.getAllUsers);

// Admin → approve/reject deposits
router.post("/admin/deposit/approve", auth, adminOnly, authController.adminApproveDeposit);

// Admin → pending withdrawals
router.get("/admin/withdrawals/pending", auth, adminOnly, authController.getPendingWithdrawals);

// Admin → handle withdrawal (approve/reject)
router.post("/admin/withdrawals/handle", auth, adminOnly, authController.handleWithdrawal);

// Admin → view all user wallets
router.get("/admin/users-wallet", auth, adminOnly, authController.getAllUsersWallet);

// Admin → upload or update payment QR/UPI
// admin payment QR
router.post(
  "/admin/payment-config",
  auth,
  adminOnly,
  upload.single("qrImage"),
  authController.adminUpdatePayment
);
router.post(
  "/admin/payment-config",
  auth,
  adminOnly,
  uploadQR.single("qrImage"),
  authController.adminUpdatePayment
);

// User → get payment details
router.get("/payment-details", auth, authController.getPaymentDetails);

// Admin → view all deposit requests
router.get("/admin/deposits", auth, adminOnly, authController.getAllDeposits);


router.get(
  "/admin/transactions",
  auth,
  adminOnly,
  authController.getAllTransactions
);

router.get("/me", auth, authController.getMe);
module.exports = router;

router.get("/my-referrals", auth, authController.getMyReferrals);

const multer = require("multer");
const fs = require("fs");
const path = require("path");

// ensure folder exists
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadDir;

    /*
      RULES:
      - withdrawal QR → screenshot → uploads/qr
      - admin payment QR → qrImage → uploads/qr
      - deposit screenshot → screenshot → uploads/screenshots
    */

    if (
      file.fieldname === "qrImage" ||
      (file.fieldname === "screenshot" && req.originalUrl.includes("withdraw"))
    ) {
      // ✅ ALL QR images
      uploadDir = path.join(process.cwd(), "uploads", "qr");
    } else {
      // ✅ deposit screenshots
      uploadDir = path.join(process.cwd(), "uploads", "screenshots");
    }

    ensureDir(uploadDir);
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only image files allowed"), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter
});

module.exports = upload;

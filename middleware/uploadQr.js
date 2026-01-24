const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure folder exists
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadDir = path.join(process.cwd(), "uploads", "screenshots");
    if (file.fieldname === "screenshot") {
      uploadDir = path.join(process.cwd(), "uploads", "qr");
    }
    ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowed = ["image/png", "image/jpg", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only image files allowed"), false);
  }
  cb(null, true);
};

const upload = multer({ storage, fileFilter });

module.exports = upload;

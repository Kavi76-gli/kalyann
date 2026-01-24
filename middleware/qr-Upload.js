const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ensure folder exists
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadDir = "uploads/screenshots"; // default

    // 🔥 route by field name
    if (file.fieldname === "screenshot") {
      uploadDir = "uploads/qr";
    }

    ensureDir(uploadDir);
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/png", "image/jpg", "image/jpeg", "image/webp"];
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

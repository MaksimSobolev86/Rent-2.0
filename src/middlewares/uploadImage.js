const multer = require("multer");
const { MAX_INPUT_BYTES } = require("../utils/processImage");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_INPUT_BYTES,
    files: 1,
  },
  fileFilter(req, file, cb) {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      cb(Object.assign(new Error("Only image files are allowed"), { status: 400 }));
      return;
    }
    if (file.mimetype === "image/svg+xml") {
      cb(Object.assign(new Error("SVG uploads are not allowed"), { status: 400 }));
      return;
    }
    cb(null, true);
  },
});

function uploadSingleImage(fieldName = "file") {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          error: `File too large (max ${Math.round(MAX_INPUT_BYTES / 1024 / 1024)}MB)`,
        });
      }
      const status = err.status || 400;
      return res.status(status).json({ error: err.message || "Upload failed" });
    });
  };
}

module.exports = { uploadSingleImage };

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).slice(0, 10).replace(/[^.\w]/g, '');
    cb(null, `${uuidv4()}${safeExt}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = config.allowedFileTypes;
  if (!allowed.includes(file.mimetype)) {
    const error = new Error(
      `File type not allowed. Allowed: ${allowed.join(', ') || 'none'}`
    );
    error.statusCode = 400;
    return cb(error, false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxFileSize,
    files: 1,
  },
});

const uploadLimitError = (err, req, res, next) => {
  if (err) {
    return res.status(err.statusCode || 400).json({
      success: false,
      message: err.message || 'File upload failed',
    });
  }
  next();
};

module.exports = { upload, uploadLimitError, uploadDir };
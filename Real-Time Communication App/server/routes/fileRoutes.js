const express = require('express');
const { uploadFile, listFiles, downloadFile } = require('../controllers/fileController');
const { protect } = require('../middleware/authMiddleware');
const { upload, uploadLimitError } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.use(protect);

router.route('/:roomId/files').get(listFiles).post(upload.single('file'), uploadLimitError, uploadFile);

router.get('/:fileId/download', downloadFile);

module.exports = router;
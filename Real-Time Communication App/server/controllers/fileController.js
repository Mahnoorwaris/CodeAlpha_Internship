const path = require('path');
const fs = require('fs');
const File = require('../models/File');
const Room = require('../models/Room');
const config = require('../config/env');

const isVercel = !!process.env.VERCEL;

const uploadFile = async (req, res, next) => {
  try {
    const { roomId } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const room = await Room.findOne({ id: roomId, isActive: true });
    if (!room) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ success: false, message: 'Meeting room not found' });
    }

    const isMember = room.participants.some(
      (p) => p.user.toString() === req.user._id.toString()
    );
    if (!isMember) {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({ success: false, message: 'You are not a participant of this room' });
    }

    const saved = await File.create({
      roomId,
      uploader: req.user._id,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });

    res.status(201).json({
      success: true,
      file: {
        id: saved._id,
        originalName: saved.originalName,
        mimeType: saved.mimeType,
        size: saved.size,
        url: `/api/files/${saved._id}/download`,
      },
    });
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    next(error);
  }
};

const listFiles = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const files = await File.find({ roomId })
      .sort({ createdAt: -1 })
      .populate('uploader', 'name')
      .limit(100);

    res.status(200).json({
      success: true,
      files: files.map((f) => ({
        id: f._id,
        originalName: f.originalName,
        mimeType: f.mimeType,
        size: f.size,
        uploader: f.uploader ? f.uploader.name : 'Unknown',
        createdAt: f.createdAt,
        url: `/api/files/${f._id}/download`,
      })),
    });
  } catch (error) {
    next(error);
  }
};

const downloadFile = async (req, res, next) => {
  try {
    const file = await File.findById(req.params.fileId);
    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const filePath = isVercel
      ? path.join('/tmp', 'uploads', file.storedName)
      : path.join(__dirname, '..', '..', 'uploads', file.storedName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File content missing on server' });
    }

    res.download(filePath, file.originalName);
  } catch (error) {
    next(error);
  }
};

module.exports = { uploadFile, listFiles, downloadFile };
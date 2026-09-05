const Room = require('../models/Room');
const { asyncHandler } = require('../middleware/errorMiddleware');

const createRoom = asyncHandler(async (req, res, next) => {
  const room = await Room.create({
    creator: req.user._id,
    participants: [{ user: req.user._id }],
  });

  res.status(201).json({
    success: true,
    room: { id: room.id, createdAt: room.createdAt },
  });
});

const joinRoom = asyncHandler(async (req, res, next) => {
  const { roomId } = req.params;
  const room = await Room.findOne({ id: roomId, isActive: true });

  if (!room) {
    return res.status(404).json({ success: false, message: 'Meeting room not found or ended' });
  }

  const alreadyJoined = room.participants.some((p) => p.user.toString() === req.user._id.toString());
  if (!alreadyJoined && room.participants.length >= 20) {
    return res.status(400).json({ success: false, message: 'Meeting room is full' });
  }

  if (!alreadyJoined) {
    room.participants.push({ user: req.user._id });
    await room.save();
  }

  res.status(200).json({
    success: true,
    room: { id: room.id },
  });
});

const getRoom = asyncHandler(async (req, res, next) => {
  const { roomId } = req.params;
  const room = await Room.findOne({ id: roomId }).populate('participants.user', 'name email');

  if (!room) {
    return res.status(404).json({ success: false, message: 'Meeting room not found' });
  }

  res.status(200).json({
    success: true,
    room: {
      id: room.id,
      participants: room.participants.map((p) => ({ name: p.user.name, id: p.user._id })),
    },
  });
});

module.exports = { createRoom, joinRoom, getRoom };
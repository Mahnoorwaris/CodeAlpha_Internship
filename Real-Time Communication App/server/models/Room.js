const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const generateRoomId = () => {
  return uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase();
};

const roomSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      default: generateRoomId,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    participants: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Room', roomSchema);
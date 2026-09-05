const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('../config/env');

const socketUsers = new Map(); // socketId -> { userId, name }

const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || config.clientOrigin.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    },
    maxHttpBufferSize: 1e6,
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, config.jwtSecret);
      socket.userId = decoded.id;
      socket.userName = (socket.handshake.auth && socket.handshake.auth.name) || 'User';
      next();
    } catch (error) {
      next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', (socket) => {
    socketUsers.set(socket.id, { userId: socket.userId, name: socket.userName });
    let currentRoom = null;

    socket.on('join-room', (roomId, callback) => {
      try {
        if (typeof roomId !== 'string' || !roomId.trim()) {
          return callback && callback({ success: false, error: 'Invalid room id' });
        }

        socket.join(roomId);
        currentRoom = roomId;

        const clients = io.sockets.adapter.rooms.get(roomId);
        const socketIds = clients ? [...clients] : [];
        // Exclude the joining client itself; other participants are returned
        // so the joiner can open a peer connection to each of them.
        const participants = socketIds
          .filter((sid) => sid !== socket.id)
          .map((sid) => {
            const info = socketUsers.get(sid) || { userId: null, name: 'User' };
            return { socketId: sid, userId: info.userId, name: info.name };
          });

        const selfInfo = { socketId: socket.id, userId: socket.userId, name: socket.userName };
        socket.to(roomId).emit('user-joined', selfInfo);

        callback && callback({
          success: true,
          participants,
          self: selfInfo,
        });
      } catch (error) {
        console.error('join-room error:', error.message);
        callback && callback({ success: false, error: 'Failed to join room' });
      }
    });

    socket.on('webrtc-offer', (payload) => {
      const target = socket.to(payload.targetSocketId);
      if (target) {
        target.emit('webrtc-offer', {
          callerSocketId: socket.id,
          callerUserId: socket.userId,
          offer: payload.offer,
        });
      }
    });

    socket.on('webrtc-answer', (payload) => {
      const target = socket.to(payload.targetSocketId);
      if (target) {
        target.emit('webrtc-answer', {
          answererSocketId: socket.id,
          answererUserId: socket.userId,
          answer: payload.answer,
        });
      }
    });

    socket.on('ice-candidate', (payload) => {
      const target = socket.to(payload.targetSocketId);
      if (target) {
        target.emit('ice-candidate', {
          senderSocketId: socket.id,
          candidate: payload.candidate,
        });
      }
    });

    socket.on('send-message', (payload, callback) => {
      if (!currentRoom) return;
      if (!payload || typeof payload.text !== 'string' || !payload.text.trim()) return;
      const text = payload.text.trim().slice(0, 1000);
      socket.to(currentRoom).emit('message', {
        socketId: socket.id,
        userId: socket.userId,
        name: socket.userName,
        text,
        time: Date.now(),
      });
      callback && callback({ success: true });
    });

    socket.on('whiteboard-draw', (payload) => {
      if (!currentRoom) return;
      socket.to(currentRoom).emit('whiteboard-draw', payload);
    });

    socket.on('whiteboard-clear', () => {
      if (!currentRoom) return;
      socket.to(currentRoom).emit('whiteboard-clear');
    });

    socket.on('file-shared', (payload) => {
      if (!currentRoom) return;
      socket.to(currentRoom).emit('file-shared', {
        socketId: socket.id,
        userId: socket.userId,
        name: socket.userName,
        file: payload && payload.file,
        time: Date.now(),
      });
    });

    socket.on('leave-room', (roomId) => {
      socket.leave(roomId);
      currentRoom = null;
      socket.to(roomId).emit('user-left', {
        socketId: socket.id,
        userId: socket.userId,
        name: socket.userName,
      });
    });

    socket.on('disconnect', () => {
      socketUsers.delete(socket.id);
      if (currentRoom) {
        socket.to(currentRoom).emit('user-left', {
          socketId: socket.id,
          userId: socket.userId,
          name: socket.userName,
        });
      }
    });
  });

  return io;
};

module.exports = { initSocket };
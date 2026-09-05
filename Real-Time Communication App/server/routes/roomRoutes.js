const express = require('express');
const { createRoom, joinRoom, getRoom } = require('../controllers/roomController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/').post(createRoom);

router.route('/:roomId/join').post(joinRoom);

router.route('/:roomId').get(getRoom);

module.exports = router;
const express = require('express');
const { body, validationResult } = require('express-validator');
const { register, login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(400)
      .json({ success: false, message: 'Validation failed', errors: errors.array() });
  }
  next();
};

router.post(
  '/register',
  [
    body('name')
      .trim()
      .escape()
      .isLength({ min: 2, max: 50 })
      .withMessage('Name must be between 2 and 50 characters')
      .isString()
      .withMessage('Name must be a string'),
    body('email')
      .trim()
      .normalizeEmail()
      .isEmail()
      .withMessage('Please provide a valid email')
      .isLength({ max: 100 })
      .withMessage('Email is too long'),
    body('password')
      .isLength({ min: 8, max: 100 })
      .withMessage('Password must be between 8 and 100 characters'),
  ],
  validate,
  register
);

router.post(
  '/login',
  [
    body('email').trim().normalizeEmail().isEmail().withMessage('Please provide a valid email'),
    body('password').isString().notEmpty().withMessage('Password is required'),
  ],
  validate,
  login
);

router.get('/me', protect, getMe);

module.exports = router;
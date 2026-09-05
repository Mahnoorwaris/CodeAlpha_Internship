const jwt = require('jsonwebtoken');
const User = require('../models/User');

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;
const EXP_FORMAT = /^\d+\s*(s|m|h|d)$|^$/;

function generateToken(user) {
  const rawExpiry = (process.env.JWT_EXPIRES_IN || '').trim().toLowerCase();
  const expiresIn = EXP_FORMAT.test(rawExpiry) && rawExpiry ? rawExpiry : '7d';

  if (!process.env.JWT_SECRET) {
    throw new Error('Server misconfigured: JWT_SECRET is not set');
  }

  return jwt.sign({ id: user._id, name: user.name }, process.env.JWT_SECRET, {
    expiresIn,
  });
}

function validateInput(name, email, password) {
  if (!name || !name.trim()) return 'Name is required';
  if (!email) return 'Email is required';
  if (!EMAIL_REGEX.test(email)) return 'Please provide a valid email address';
  if (!password) return 'Password is required';
  if (password.length < 6) return 'Password must be at least 6 characters';
  return null;
}

const registerUser = async (req, res) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body.password;

    const validationError = validateInput(name, email, password);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'This email is already registered. Please log in instead.' });
    }

    const user = await User.create({ name, email, password });

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token: generateToken(user),
      data: user,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This email is already registered. Please log in instead.' });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    console.error('Register error:', error.message);
    res.status(500).json({ success: false, message: 'Something went wrong during registration' });
  }
};

const loginUser = async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    user.password = undefined;

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token: generateToken(user),
      data: user,
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ success: false, message: 'Something went wrong during login' });
  }
};

const getMe = async (req, res) => {
  res.status(200).json({ success: true, data: req.user });
};

module.exports = { registerUser, loginUser, getMe };

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authenticate = require('../middleware/auth');

// Pre-computed bcrypt hash of a random string - used to equalize login
// timing whether or not the email exists (mitigates user enumeration)
const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8DsAMd4xM8pTn5tS6kZBzprD6fHbKa';

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// Safe projection - password is select:false anyway, this is defense in depth
function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    username: user.username,
    email: user.email,
    profilePicture: user.profilePicture,
    bio: user.bio,
    createdAt: user.createdAt,
  };
}

router.post('/register', async (req, res) => {
  try {
    const { name, username, email, password } = req.body || {};

    // Required-field validation
    const missing = [];
    if (!name || !String(name).trim()) missing.push('name');
    if (!username || !String(username).trim()) missing.push('username');
    if (!email || !String(email).trim()) missing.push('email');
    if (!password) missing.push('password');
    if (missing.length) {
      return res.status(400).json({ success: false, message: `Missing required field(s): ${missing.join(', ')}` });
    }

    // Format validation
    const uname = String(username).trim().toLowerCase();
    const mail = String(email).trim().toLowerCase();
    if (uname.length < 3 || uname.length > 20 || !/^[a-z0-9_]+$/.test(uname)) {
      return res.status(400).json({ success: false, message: 'Username must be 3-20 characters: lowercase letters, numbers and underscore only' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
    }

    // Duplicate prevention (fast pre-check with clear per-field messages)
    const duplicate = await User.findOne({ $or: [{ email: mail }, { username: uname }] });
    if (duplicate) {
      const field = duplicate.email === mail ? 'Email' : 'Username';
      return res.status(409).json({ success: false, message: `${field} already registered` });
    }

    // Never store plain-text passwords
    const hash = await bcrypt.hash(String(password), 10);

    let user;
    try {
      user = await User.create({ name: String(name).trim(), username: uname, email: mail, password: hash });
    } catch (err) {
      // Race-condition safety net: unique index violation
      if (err.code === 11000) {
        const dupField = Object.keys(err.keyPattern || {})[0] === 'email' ? 'Email' : 'Username';
        return res.status(409).json({ success: false, message: `${dupField} already registered` });
      }
      throw err;
    }

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token: signToken(user._id),
      user: publicUser(user),
    });
  } catch (err) {
    console.error('[AUTH/register]', err.name || 'Error'); // no raw error -> no secrets in logs
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: String(email).trim().toLowerCase() }).select('+password');
    // Same generic message + timing-equalized compare for both failure cases
    const valid = user
      ? await bcrypt.compare(String(password), user.password)
      : await bcrypt.compare(String(password), DUMMY_HASH);

    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    res.json({
      success: true,
      message: 'Login successful',
      token: signToken(user._id),
      user: publicUser(user),
    });
  } catch (err) {
    console.error('[AUTH/login]', err.name || 'Error');
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    // password excluded via schema select:false
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User no longer exists' });
    }
    res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    console.error('[AUTH/me]', err.name || 'Error');
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

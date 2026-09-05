const router = require('express').Router();
const mongoose = require('mongoose');
const authenticate = require('../middleware/auth');
const User = require('../models/User');

const USERNAME_PATTERN = /^[a-z0-9_]+$/;

function parseUserId(raw) {
  return mongoose.isValidObjectId(raw) ? raw : null;
}

// Public-safe projection: password kabhi include nahi hota
// (password schema me select:false hai - ye defense-in-depth hai)
function publicProfile(user) {
  return {
    id: user._id,
    name: user.name,
    username: user.username,
    profilePicture: user.profilePicture,
    bio: user.bio,
    followersCount: user.followers.length,
    followingCount: user.following.length,
    createdAt: user.createdAt,
  };
}

// NOTE: specific routes (/suggestions, /profile) hamesha /:username se PEHLE
// registered hote hain taaki wo param route me swallow na ho jayein

// GET /api/users/suggestions - other users (auth required)
router.get('/suggestions', authenticate, async (req, res) => {
  try {
    const me = await User.findById(req.userId).select('following');
    if (!me) return res.status(404).json({ success: false, message: 'User no longer exists' });

    // Exclude self AND everyone the current user already follows
    const excluded = [req.userId, ...me.following];
    const users = await User.find({ _id: { $nin: excluded } })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('name username profilePicture bio followers following createdAt');

    res.json({
      success: true,
      count: users.length,
      users: users.map((u) => ({
        id: u._id,
        name: u.name,
        username: u.username,
        profilePicture: u.profilePicture,
        bio: u.bio,
        followersCount: u.followers.length,
        createdAt: u.createdAt,
      })),
    });
  } catch (err) {
    console.error('[USERS/suggestions]', err.name || 'Error'); // no raw errors -> no secrets
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/users/profile - update own profile (auth required)
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, username, profilePicture, bio } = req.body || {};
    const updates = {};
    const errors = [];

    if (name !== undefined) {
      const n = String(name).trim();
      if (n.length < 2 || n.length > 50) errors.push('Name must be 2-50 characters');
      else updates.name = n;
    }
    if (username !== undefined) {
      const u = String(username).trim().toLowerCase();
      if (u.length < 3 || u.length > 20 || !USERNAME_PATTERN.test(u)) {
        errors.push('Username must be 3-20 characters: lowercase letters, numbers and underscore only');
      } else updates.username = u;
    }
    if (profilePicture !== undefined) {
      const p = String(profilePicture).trim();
      if (p.length > 500) errors.push('profilePicture URL too long (max 500 characters)');
      else updates.profilePicture = p;
    }
    if (bio !== undefined) {
      const b = String(bio).trim();
      if (b.length > 200) errors.push('Bio must be at most 200 characters');
      else updates.bio = b;
    }

    if (errors.length) return res.status(400).json({ success: false, message: errors.join('; ') });
    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, message: 'Nothing to update - provide name, username, profilePicture or bio' });
    }

    // Duplicate username prevention (self ko allow - apna hi username dobara set karna ok)
    if (updates.username) {
      const dup = await User.findOne({ username: updates.username, _id: { $ne: req.userId } });
      if (dup) return res.status(409).json({ success: false, message: 'Username already taken' });
    }

    let user;
    try {
      user = await User.findByIdAndUpdate(req.userId, { $set: updates }, { new: true, runValidators: true });
    } catch (err) {
      // Race-condition safety net: unique index violation
      if (err.code === 11000) return res.status(409).json({ success: false, message: 'Username already taken' });
      throw err;
    }

    if (!user) return res.status(404).json({ success: false, message: 'User no longer exists' });

    res.json({ success: true, message: 'Profile updated successfully', user: publicProfile(user) });
  } catch (err) {
    console.error('[USERS/profile]', err.name || 'Error');
    res.status(500).json({ success: false, message: 'Server error during profile update' });
  }
});

// POST /api/users/:id/follow - follow another user (auth required)
router.post('/:id/follow', authenticate, async (req, res) => {
  try {
    const targetId = parseUserId(req.params.id);
    if (!targetId) return res.status(400).json({ success: false, message: 'Invalid user ID' });

    if (String(targetId) === String(req.userId)) {
      return res.status(400).json({ success: false, message: 'You cannot follow yourself' });
    }

    const [me, target] = await Promise.all([User.findById(req.userId), User.findById(targetId)]);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });
    if (!me) return res.status(404).json({ success: false, message: 'User no longer exists' });

    if (me.following.some((f) => String(f) === String(target._id))) {
      return res.status(409).json({ success: false, message: 'Already following this user' });
    }

    const updatedMe = await User.findByIdAndUpdate(
      me._id,
      { $addToSet: { following: target._id } },
      { new: true }
    );
    const updatedTarget = await User.findByIdAndUpdate(
      target._id,
      { $addToSet: { followers: me._id } },
      { new: true }
    );

    res.json({
      success: true,
      message: `You are now following ${target.username}`,
      followingCount: updatedMe.following.length,
      followersCount: updatedTarget.followers.length,
    });
  } catch (err) {
    console.error('[USERS/follow]', err.name || 'Error');
    res.status(500).json({ success: false, message: 'Server error while following user' });
  }
});

// DELETE /api/users/:id/follow - unfollow a followed user (auth required)
router.delete('/:id/follow', authenticate, async (req, res) => {
  try {
    const targetId = parseUserId(req.params.id);
    if (!targetId) return res.status(400).json({ success: false, message: 'Invalid user ID' });

    if (String(targetId) === String(req.userId)) {
      return res.status(400).json({ success: false, message: 'You cannot unfollow yourself' });
    }

    const [me, target] = await Promise.all([User.findById(req.userId), User.findById(targetId)]);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });
    if (!me) return res.status(404).json({ success: false, message: 'User no longer exists' });

    if (!me.following.some((f) => String(f) === String(target._id))) {
      return res.status(409).json({ success: false, message: 'You are not following this user' });
    }

    const updatedMe = await User.findByIdAndUpdate(
      me._id,
      { $pull: { following: target._id } },
      { new: true }
    );
    const updatedTarget = await User.findByIdAndUpdate(
      target._id,
      { $pull: { followers: me._id } },
      { new: true }
    );

    res.json({
      success: true,
      message: `You unfollowed ${target.username}`,
      followingCount: updatedMe.following.length,
      followersCount: updatedTarget.followers.length,
    });
  } catch (err) {
    console.error('[USERS/unfollow]', err.name || 'Error');
    res.status(500).json({ success: false, message: 'Server error while unfollowing user' });
  }
});

// GET /api/users/:username - PUBLIC profile (no token needed)
router.get('/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: String(req.params.username).toLowerCase() });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, profile: publicProfile(user) });
  } catch (err) {
    console.error('[USERS/getByUsername]', err.name || 'Error');
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

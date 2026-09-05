const jwt = require('jsonwebtoken');

// Bearer token verification - sets req.userId on success
module.exports = function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required - no token provided' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    return next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid token';
    // err details are never logged/returned - they contain no secrets but keep responses uniform
    return res.status(401).json({ success: false, message });
  }
};

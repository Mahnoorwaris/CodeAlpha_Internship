require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB, redact, pingDB, getConnectionState } = require('./config/db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/comments', require('./routes/comments'));

// Temporary root info endpoint - feature routes arrive in later steps
app.get('/', (req, res) => {
  res.json({ success: true, project: 'CodeAlpha_SocialMediaPlatform', status: 'running' });
});

// Health check - reports REAL MongoDB status verified via live ping (no mocks)
app.get('/api/health', async (req, res) => {
  const alive = await pingDB(); // true only if an actual round-trip to mongod succeeds
  const conn = getConnectionState();
  res.json({
    status: 'ok',
    server: 'running',
    mongodb: alive ? 'connected' : conn.state,
    database: conn.database,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Sanitized global error handler - never leaks credentials/stack to clients
app.use((err, req, res, next) => {
  console.error('[ERROR]', redact(err.stack || err.message || err));
  res.status(500).json({ success: false, message: 'Server error' });
});

// Exported so Vercel serverless can wrap this app as a request handler
module.exports = app;

if (require.main === module) {
  // Direct execution (npm start / node server.js): connect, then listen
  connectDB()
    .then(() => {
      const PORT = process.env.PORT || 3000;
      app.listen(PORT, () => console.log(`[APP] http://localhost:${PORT}`));
    })
    .catch((err) => {
      console.error('[FATAL] Failed to start:', redact(err.message));
      process.exit(1);
    });
} else {
  // Imported by a platform (e.g. Vercel): no listener - just ensure the
  // DB connection is established; mongoose buffers queries until ready.
  // Serverless cold starts can hit transient DNS hiccups, so retry a few times.
  let attempt = 0;
  const tryConnect = () => {
    attempt++;
    connectDB()
      .then(() => console.log(`[DB] ready (attempt ${attempt})`))
      .catch((err) => {
        if (attempt < 3) {
          console.warn(`[DB] connect attempt ${attempt} failed - retrying`);
          setTimeout(tryConnect, 2000 * attempt);
        } else {
          console.error('[DB] Initial connect failed after retries:', redact(err.message));
        }
      });
  };
  tryConnect();
}

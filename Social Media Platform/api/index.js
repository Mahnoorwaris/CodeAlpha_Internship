// Vercel serverless entry point - wraps the existing Express app.
// The app itself lives in ../server.js (single source of truth).
module.exports = require('../server');

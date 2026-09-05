const mongoose = require('mongoose');

// Detects template placeholders so the app never tries to connect
// to a literal "mongodb+srv://<USERNAME>:..." string
const PLACEHOLDER_PATTERN = /<USERNAME>|<PASSWORD>|<CLUSTER>|<DATABASE>/i;

// Strips credentials from any string before it reaches console output
function redact(value) {
  return String(value == null ? '' : value).replace(/\/\/[^:/\s]+:[^@\s]+@/g, '//***:***@');
}

function resolveUri() {
  const uri = process.env.MONGO_URI;
  if (!uri) return { uri: null, reason: 'MONGO_URI is not set' };
  if (PLACEHOLDER_PATTERN.test(uri)) {
    return { uri: null, reason: 'MONGO_URI still contains placeholders - edit .env with your real URI' };
  }
  return { uri };
}

async function connectDB() {
  const { uri, reason } = resolveUri();

  if (!uri) {
    // Dev/demo fallback: ephemeral in-memory MongoDB
    console.warn(`[DB] ${reason}`);
    console.warn('[DB] Falling back to in-memory MongoDB (data resets on restart)');
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri('socialmedia'));
    console.log('[DB] Connected to in-memory MongoDB');
    return;
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    // Log database name only - never the connection string
    console.log(`[DB] Connected to MongoDB (database: ${mongoose.connection.name})`);
  } catch (err) {
    // Raw mongoose errors can embed the full connection string - print safe parts only
    console.error('[DB] Connection failed:', err.codeName || err.name || 'UnknownError');
    throw new Error('MongoDB connection failed - check MONGO_URI in your .env file');
  }
}

// Real-time connection state (not cached/faked) - mapped from mongoose readyState
const CONNECTION_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

function getConnectionState() {
  const readyState = mongoose.connection.readyState;
  return {
    state: CONNECTION_STATES[readyState] || 'unknown',
    readyState,
    database: mongoose.connection.name || null,
  };
}

// Verifies the connection is actually alive with a real server round-trip.
// Returns true only if a live ping succeeds - never a cached/mock value.
async function pingDB() {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return false;
  try {
    await mongoose.connection.db.admin().command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

module.exports = { connectDB, redact, getConnectionState, pingDB };

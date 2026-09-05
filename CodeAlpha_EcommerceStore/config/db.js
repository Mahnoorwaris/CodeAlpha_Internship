const mongoose = require('mongoose');

const MAX_CONNECT_ATTEMPTS = 4;
let connPromise = null;

async function tryConnect() {
  let lastError;

  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
    try {
      const conn = await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 12000,
        family: 4,
      });

      console.log(`MongoDB Connected: ${conn.connection.host}`);

      return conn;
    } catch (error) {
      lastError = error;
      console.error(`MongoDB connect attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed: ${error.message}`);

      if (attempt < MAX_CONNECT_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
        mongoose.disconnect().catch(() => {});
      }
    }
  }

  throw lastError;
}

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connPromise) {
    console.log('Trying to connect to MongoDB...');

    connPromise = tryConnect()
      .then((conn) => conn)
      .catch((error) => {
        connPromise = null;
        throw error;
      });
  }

  return connPromise;
};

module.exports = connectDB;
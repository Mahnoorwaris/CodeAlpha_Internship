const dotenv = require('dotenv');

dotenv.config();

const requiredVars = ['MONGO_URI', 'JWT_SECRET'];

for (const key of requiredVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10485760,
  allowedFileTypes: (process.env.ALLOWED_FILE_TYPES || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean),
};

module.exports = config;
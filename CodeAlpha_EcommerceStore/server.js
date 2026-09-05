require('dotenv').config();

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const productRoutes = require('./routes/productRoutes');
const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error(`DB unavailable for ${req.method} ${req.originalUrl}:`, error.message);
    res.status(503).json({
      success: false,
      message: 'Database temporarily unavailable. Please try again.',
    });
  }
});

app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);

app.get('/api/health', async (req, res) => {
  try {
    await connectDB();

    res.json({
      status: 'ok',
      mongodb:
        mongoose.connection.readyState === 1
          ? 'connected'
          : 'disconnected'
    });
  } catch (error) {
    console.error('Health check MongoDB error:', error);

    res.status(500).json({
      status: 'error',
      mongodb: 'disconnected',
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 5000;

// Sirf local development mein server listen kare
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
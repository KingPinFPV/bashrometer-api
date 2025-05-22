// app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors'); // <--- הוסף את זה
// const bodyParser = require('body-parser'); // לא צריך אם משתמשים ב-express.json()

// Import routes
const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const retailersRoutes = require('./routes/retailers');
const pricesRoutes = require('./routes/prices');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // <--- השתמש ב-cors middleware כאן

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/retailers', retailersRoutes);
app.use('/api/prices', pricesRoutes);

// Simple root route
app.get('/', (req, res) => {
  res.send('Bashrometer API is running!');
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
  console.log(`Bashrometer API running on port ${PORT}`);
});
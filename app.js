// app.js
require('dotenv').config(); // Load environment variables from .env file at the very beginning
const express = require('express');
const bodyParser = require('body-parser'); // Or use express.json() as noted below

// Import routes
const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const retailersRoutes = require('./routes/retailers');
const pricesRoutes = require('./routes/prices');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// For parsing application/json
app.use(express.json()); // Preferred for modern Express versions
// For parsing application/x-www-form-urlencoded (less common for APIs but good to have)
app.use(express.urlencoded({ extended: true })); 
// If you specifically want to use body-parser:
// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: true }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/retailers', retailersRoutes);
app.use('/api/prices', pricesRoutes);

// Simple root route for health check or basic info
app.get('/', (req, res) => {
  res.send('Bashrometer API is running!');
});

// Global error handler (optional basic version)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(PORT, () => {
  console.log(`Bashrometer API running on port ${PORT}`);
});
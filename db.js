// db.js
const { Pool } = require('pg');
require('dotenv').config(); // Ensures environment variables are loaded

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Optional: SSL configuration if required by your PostgreSQL provider (especially cloud services)
  // ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Optional: Test the connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to the database:', err.stack);
  } else {
    console.log('Successfully connected to the database. Current time from DB:', res.rows[0].now);
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  // You can also export the pool directly if needed elsewhere
  // pool: pool 
};
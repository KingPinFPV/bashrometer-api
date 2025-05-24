// app.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const retailersRoutes = require('./routes/retailers');
const pricesRoutes = require('./routes/prices');

const app = express();

// 1. CORS Middleware - הגדרה מפורטת ומוקדמת
const allowedOrigins = [
  'http://localhost:3000', // ה-Frontend שלך רץ על כתובת זו
  // הוסף כאן עוד Origins אם יש לך סביבות נוספות
  // לדוגמה, אם הייתה לך כתובת Codespace:
  // 'https://your-codespace-name-random-string.app.github.dev' 
];

// הערה: אם אתה רוצה שה-allowedOrigins יתעדכנו ממשתני סביבה, השתמש בלוגיקה דומה לזו:
// const DYNAMIC_ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
// const finalAllowedOrigins = [...new Set([...allowedOrigins, ...DYNAMIC_ALLOWED_ORIGINS])]; // מאחד ומונע כפילויות

const corsOptions = {
  origin: function (origin, callback) {
    // הדפס לוגים לדיבאגינג של CORS
    // console.log("CORS Check - Incoming Origin:", origin);
    // console.log("CORS Check - Allowed Origins:", allowedOrigins);

    // אפשר גישה ללא origin (למשל, Postman, curl) או אם ה-origin ברשימה המותרת
    // אם אתה משתמש ב-finalAllowedOrigins מהדוגמה למעלה, החלף את allowedOrigins כאן:
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      // console.log("CORS Check - Origin Allowed:", origin || 'No Origin');
      callback(null, true);
    } else {
      console.warn(`CORS: Origin not allowed: ${origin}`); // לוג לניפוי בעיות CORS
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS", // ודא ש-OPTIONS כלול
  allowedHeaders: "Content-Type,Authorization,X-Requested-With", // הוספתי X-Requested-With, לפעמים נדרש
  credentials: true,
  optionsSuccessStatus: 204
};

// חשוב מאוד: טפל בבקשות OPTIONS (preflight) לפני כל ה-middleware האחרים ולפני app.use(cors(corsOptions)) הכללי.
// זה מבטיח שבקשות preflight יקבלו תגובה מהירה עם ה-headers הנכונים.
app.options('*', cors(corsOptions)); 

// לאחר מכן, הפעל את CORS עבור כל שאר הבקשות.
app.use(cors(corsOptions));


// 2. Body Parsers - אחרי CORS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. API Routes - אחרי CORS ו-Body Parsers
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/retailers', retailersRoutes);
app.use('/api/prices', pricesRoutes);

// Simple root route for health check or basic info
app.get('/', (req, res) => {
  res.send('Bashrometer API is running!');
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Global Error Handler Caught:", err.name, "-", err.message);
  if (err.stack) {
    console.error(err.stack);
  }

  if (res.headersSent) {
    return next(err);
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Not allowed by CORS' });
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
  }
  
  if (err.code && typeof err.code === 'string' && (err.code.startsWith('22') || err.code.startsWith('23'))) {
    console.error("PostgreSQL Data Error:", err.detail || err.message);
    return res.status(400).json({ error: 'Invalid data or constraint violation.', details: err.detail || err.message });
  }

  res.status(err.statusCode || 500).json({ 
    error: err.customMessage || 'Something broke on the server!',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined 
  });
});

module.exports = app;

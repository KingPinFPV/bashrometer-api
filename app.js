// app.js
// אם אתה טוען את .env.test או .env מ-server.js, שקול להסיר את הקריאה הזו מכאן
// או להפוך אותה למותנית כפי שהצעתי קודם, כדי למנוע טעינה כפולה או טעינה של קובץ לא נכון.
// כרגע, נשאיר אותה כפי שהייתה אצלך, בהנחה ש-server.js יטען את קובץ ה-.env הנכון לפני שה-app הזה ירוץ בבדיקות.
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const retailersRoutes = require('./routes/retailers');
const pricesRoutes = require('./routes/prices');

const app = express();
// הסרנו את הגדרת PORT מכאן, היא תהיה ב-server.js

// 1. CORS Middleware - הגדרה מפורטת ומוקדמת
const allowedOrigins = [
  'https://laughing-telegram-xp5p77r4vvv2v67x-3000.app.github.dev', // Your Frontend Codespace URL/page.tsx, uploaded:bashrometer-ui-main/src/app/register/page.tsx, uploaded:bashrometer-ui-main/src/app/products/page.tsx, uploaded:bashrometer-ui-main/src/app/login/page.tsx, uploaded:bashrometer-ui-main/src/app/report-price/page.tsx]
  // הוסף כאן עוד Origins אם יש לך סביבות נוספות (למשל, http://localhost:3001 אם תריץ Frontend מקומית)
];

// אם אתה רוצה שה-allowedOrigins יתעדכנו ממשתני סביבה, השתמש בלוגיקה דומה לזו:
// const DYNAMIC_ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
// const finalAllowedOrigins = [...new Set([...allowedOrigins, ...DYNAMIC_ALLOWED_ORIGINS])]; // מאחד ומונע כפילויות

const corsOptions = {
  origin: function (origin, callback) {
    // אפשר גישה ללא origin (למשל, Postman, curl, אפליקציות מובייל) או אם ה-origin ברשימה המותרת
    // אם אתה משתמש ב-finalAllowedOrigins מהדוגמה למעלה, החלף את allowedOrigins כאן:
    if (!origin || allowedOrigins.indexOf(origin) !== -1) { // או finalAllowedOrigins.includes(origin)
      callback(null, true);
    } else {
      console.warn(`CORS: Origin not allowed: ${origin}`); // לוג לניפוי בעיות CORS
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: "Content-Type,Authorization", // חשוב מאוד לאפשר Authorization header
  credentials: true, // מאפשר שליחת קוקיז או authorization headers עם בקשות (רלוונטי ל-JWT)
  optionsSuccessStatus: 204 // מחזיר 204 (No Content) לבקשות OPTIONS מוצלחות (preflight)
};

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
// שים לב: ודא שיש לך קובץ middleware/errorHandler.js והוא מיוצא, או השתמש בגרסה המלאה שהייתה כאן
// אם errorHandler.js קיים ומטפל טוב יותר, השתמש בו:
// const errorHandler = require('./middleware/errorHandler');
// app.use(errorHandler);

// אם אתה רוצה את ה-Global Error Handler שהיה לך ישירות כאן:
app.use((err, req, res, next) => {
  console.error("Global Error Handler Caught:", err.name, "-", err.message);
  if (err.stack) { // הוסף את ה-stack trace ללוג לדיבאג טוב יותר
    console.error(err.stack);
  }

  if (res.headersSent) { // אם הכותרות כבר נשלחו, העבר הלאה לטיפול ברירת המחדל של Express
    return next(err);
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Not allowed by CORS' });
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
  }
  
  // טיפול בשגיאות pg (בסיס נתונים)
  if (err.code && typeof err.code === 'string' && (err.code.startsWith('22') || err.code.startsWith('23'))) { // שגיאות נתונים או הפרות אילוצים של PostgreSQL
    console.error("PostgreSQL Data Error:", err.detail || err.message);
    return res.status(400).json({ error: 'Invalid data or constraint violation.', details: err.detail || err.message });
  }

  // אם אתה משתמש במחלקות שגיאה מותאמות מ-utils/errors.js (כשתחזיר אותו)
  // if (err.statusCode && err.message) {
  //   return res.status(err.statusCode).json({ error: err.message });
  // }

  // Default to 500 server error if no specific handling
  res.status(err.statusCode || 500).json({ 
    error: err.customMessage || 'Something broke on the server!', // הוסף customMessage אם תרצה
    details: process.env.NODE_ENV === 'development' ? err.message : undefined 
  });
});


// הסרנו את app.listen() מכאן. הוא יעבור לקובץ server.js
module.exports = app; // ייצא את אפליקציית ה-Express
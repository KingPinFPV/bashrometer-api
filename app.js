// app.js
require('dotenv').config(); 
const express = require('express');
const cors = require('cors'); 

// Import routes
const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const retailersRoutes = require('./routes/retailers');
const pricesRoutes = require('./routes/prices');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. CORS Middleware - הגדרה מפורטת ומוקדמת
const allowedOrigins = [
  'https://laughing-telegram-xp5p77r4vvv2v67x-3000.app.github.dev', // Your Frontend Codespace URL
  // הוסף כאן עוד Origins אם יש לך סביבות נוספות (למשל, http://localhost:3001 אם תריץ Frontend מקומית)
];

const corsOptions = {
  origin: function (origin, callback) {
    // אפשר גישה ללא origin (למשל, Postman, curl, אפליקציות מובייל) או אם ה-origin ברשימה המותרת
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
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
// app.options('*', cors(corsOptions)); // לרוב לא נדרש אם ה-middleware הראשי מטפל בזה, אבל לא מזיק

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

// Global error handler (optional basic version)
app.use((err, req, res, next) => {
  console.error("Global Error Handler:", err.name, err.message, err.stack);
  
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Not allowed by CORS' });
  }
  
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token from global handler.' });
  }
  if (err.message && err.message.includes('data and hash arguments required')) { // Bcrypt error
      console.error("Bcrypt error details:", err);
      return res.status(400).json({ error: 'Invalid input for authentication process.' });
  }
  
  // Default to 500 server error if no specific handling
  res.status(500).json({ error: 'Something broke on the server!', details: err.message });
});

app.listen(PORT, () => {
  console.log(`Bashrometer API running on port ${PORT}`);
});
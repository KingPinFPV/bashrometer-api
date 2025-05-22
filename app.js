// app.js
require('dotenv').config(); // Load environment variables from .env file at the very beginning
const express = require('express');
const cors = require('cors'); // ייבוא cors
// const bodyParser = require('body-parser'); // לא בשימוש אם משתמשים ב-express.json/urlencoded

// Import routes
const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const retailersRoutes = require('./routes/retailers');
const pricesRoutes = require('./routes/prices');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. CORS Middleware - הגדרה מפורטת ומוקדמת
const corsOptions = {
  // החלף ב-URL המדויק של ה-Frontend שלך כשתעלה לפרודקשן.
  // עבור Codespaces, ה-URL יכול להשתנות, לכן '*' יכול להיות נוח לפיתוח,
  // אבל ה-URL הספציפי שסיפקת קודם הוא הכי טוב אם הוא קבוע יחסית.
  origin: 'https://laughing-telegram-xp5p77r4vvv2v67x-3000.app.github.dev', 
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: "Content-Type,Authorization", // חשוב לאפשר Authorization header
  preflightContinue: false,
  optionsSuccessStatus: 204 // עבור בקשות OPTIONS (preflight)
};
app.use(cors(corsOptions));

// יש כאלה שמוסיפים גם טיפול גלובלי ב-OPTIONS, למרות שה-middleware הראשי אמור לכסות זאת
// app.options('*', cors(corsOptions)); // יכול לעזור במקרים מסוימים

// 2. Body Parsers - אחרי CORS
app.use(express.json()); // Preferred for modern Express versions, parses application/json
app.use(express.urlencoded({ extended: true })); // Parses application/x-www-form-urlencoded

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
  console.error("Global Error Handler:", err.stack);
  // אם השגיאה היא מ-jsonwebtoken (למשל, טוקן לא תקין שנשלח ולא נתפס על ידי authMiddleware)
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token from global handler.' });
  }
  // אם השגיאה היא מ-bcrypt (למשל, ב-compare אם ה-hash לא תקין)
  if (err.message && err.message.includes('data and hash arguments required')) {
      console.error("Bcrypt error:", err);
      return res.status(400).json({ error: 'Invalid input for authentication.' });
  }
  
  res.status(500).json({ error: 'Something broke on the server!', details: err.message });
});

app.listen(PORT, () => {
  console.log(`Bashrometer API running on port ${PORT}`);
  // בדיקת החיבור ל-DB מתבצעת כעת בתוך db.js
});
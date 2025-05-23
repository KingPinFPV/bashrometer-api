// controllers/authController.js
const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ודא ש-JWT_SECRET נטען מקובץ .env
// ה-Fallback כאן הוא רק למקרה חירום בפיתוח מקומי אם הקובץ חסר,
// אבל בסביבת בדיקות ופרודקשן הוא חייב להיות מוגדר בקבצי ה-.env המתאימים.
const JWT_SECRET = process.env.JWT_SECRET || "unsafe_dev_secret_fallback_please_set_in_env";

// Register new user
const register = async (req, res, next) => { // הוספת next
  const { name, email, password, role = 'user' } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (!/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }
  // ודא שה-role תקין אם הוא נשלח, אחרת השתמש בברירת המחדל
  const validRoles = ['user', 'admin', 'editor']; // התאם לרשימת התפקידים שלך ב-schema.sql
  const finalRole = role && validRoles.includes(role.toLowerCase()) ? role.toLowerCase() : 'user';


  try {
    const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (userExists.rows.length > 0) {
      // שים לב: הבדיקה שלך מצפה ל-409 כאן
      return res.status(409).json({ error: 'Email already registered.' }); 
    }

    const password_hash = await bcrypt.hash(password, 10); 
    
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
      [name, email.toLowerCase(), password_hash, finalRole] // שימוש ב-finalRole
    );
    const newUser = result.rows[0]; // שנה את שם המשתנה ל-newUser כדי למנוע בלבול עם user מהטוקן

    // Generate JWT
    const token = jwt.sign(
      { userId: newUser.id, role: newUser.role, email: newUser.email, name: newUser.name }, // הוסף עוד פרטים רלוונטיים לטוקן אם צריך
      JWT_SECRET,
      { expiresIn: '2h' } 
    );

    // אל תשלח את ה-token בתגובת הרישום אם אתה רוצה שהמשתמש יתחבר בנפרד.
    // אם אתה רוצה שהמשתמש יהיה מחובר מיד לאחר הרישום, אז השאר את הטוקן.
    // לצורך בדיקות, זה יכול להיות נוח להחזיר את הטוקן.
    res.status(201).json({ 
      message: 'User registered successfully.', // עם נקודה, כפי שהבדיקות מצפות עכשיו
      user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role, created_at: newUser.created_at }, 
      token // החזרת הטוקן יכולה להיות שימושית אם אתה רוצה שהמשתמש יהיה מחובר מיד
    });

  } catch (err) {
    console.error('Error in register controller:', err.message); // הסר את err.stack מכאן, הוא יודפס מה-Global Error Handler
    next(err); // העבר ל-Global Error Handler
  }
};

// Login
const login = async (req, res, next) => { // הוספת next
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const result = await pool.query('SELECT id, name, email, password_hash, role FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) {
      // הבדיקה שלך מצפה ל-400 או 401, עם הודעת "Invalid credentials."
      return res.status(401).json({ error: 'Invalid credentials.' }); 
    }
    const userFromDb = result.rows[0]; // שנה שם משתנה כדי למנוע בלבול

    const passwordMatch = await bcrypt.compare(password, userFromDb.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: userFromDb.id, role: userFromDb.role, email: userFromDb.email, name: userFromDb.name }, // הוסף עוד פרטים רלוונטיים לטוקן אם צריך
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    // הכן אובייקט משתמש לשליחה, ללא הסיסמה המוצפנת
    const userToReturn = {
        id: userFromDb.id,
        name: userFromDb.name,
        email: userFromDb.email,
        role: userFromDb.role
        // הוסף created_at אם הוא קיים ב-userFromDb והוא רלוונטי כאן
    };
    
    res.json({ 
      message: 'Login successful.', // עם נקודה, כפי שהבדיקות מצפות עכשיו
      user: userToReturn, 
      token 
    });

  } catch (err) {
    console.error('Error in login controller:', err.message);
    next(err);
  }
};

// Get current user info (protected)
const me = async (req, res, next) => { // הוספת next
  // req.user מגיע מ-authenticateToken middleware
  if (!req.user || req.user.userId === undefined) { // שנה לבדיקת userId כפי שמוגדר בטוקן
    console.error("User ID not found in token for /me endpoint");
    return res.status(401).json({ error: "Unauthorized: User ID missing or invalid token." });
  }
  const loggedInUserId = req.user.userId; 

  try {
    const result = await pool.query('SELECT id, name, email, role, created_at FROM users WHERE id = $1', [loggedInUserId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error in me controller:', err.message);
    next(err);
  }
};

// ודא שאתה מייצא את הפונקציות לאחר שהוגדרו כמשתנים
module.exports = {
    register,
    login,
    me
};
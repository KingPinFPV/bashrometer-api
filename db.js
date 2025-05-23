// db.js
const { Pool } = require('pg');

// אין צורך לקרוא ל-require('dotenv').config() כאן שוב
// אם הוא כבר נקרא ב-app.js (או בקובץ הכניסה הראשי) לפני ייבוא מודול זה.
// אם db.js מיובא לפני ש-dotenv נקרא ב-app.js, אז השאר את השורה הזו.
// באופן כללי, עדיף לקרוא ל-dotenv.config() פעם אחת בלבד, כמה שיותר מוקדם בקובץ הכניסה הראשי של האפליקציה.
// אם אתה טוען .env.test מ-app.js, אז אתה רוצה ש-process.env.DATABASE_URL כבר יהיה מעודכן מכאן.
require('dotenv').config({ 
  path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' 
});


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // הגדרות SSL: ה-DATABASE_URL שלך כבר כולל ?sslmode=require,
  // כך ש-pg אמור לטפל בזה. אם יש בעיות, אפשר להוסיף כאן הגדרות SSL מפורשות:
  // ssl: (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test' || process.env.DB_SSL_REQUIRED === 'true') 
  //        ? { rejectUnauthorized: false } 
  //        : false,
});

// פונקציה אופציונלית לבדיקת חיבור, שניתן לקרוא לה במפורש מ-app.js לאחר האתחול
const checkConnection = async () => {
  let client; // הגדר מחוץ ל-try כדי שיהיה זמין ב-finally
  try {
    client = await pool.connect(); // קבל חיבור מה-pool
    const res = await client.query('SELECT NOW()');
    console.log('Successfully connected to the database. Current time from DB:', res.rows[0].now);
  } catch (err) {
    console.error('Error connecting to the database or executing initial query:', err.stack);
    // בסביבת בדיקות, ייתכן שתרצה שהאפליקציה תיכשל או שהבדיקות ייכשלו בבירור
    if (process.env.NODE_ENV === 'test') {
      throw err; 
    }
  } finally {
    if (client) {
      client.release(); // שחרר את החיבור חזרה ל-pool, חשוב מאוד!
    }
  }
};

// הערה: אל תקרא ל-checkConnection() כאן ברמה הגלובלית של המודול.
// קרא לה מ-app.js לאחר שהשרת התחיל להאזין, או רק בעת הצורך.

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool: pool, // ייצא את ה-pool ישירות כדי ש-jest יוכל לקרוא ל-pool.end()
  checkConnection // ייצא את פונקציית הבדיקה אם תרצה להשתמש בה
};
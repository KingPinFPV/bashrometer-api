// server.js
const app = require('./app'); // ייבוא האפליקציה שהגדרנו ב-app.js
const db = require('./db');   // ייבוא מודול ה-DB שלנו כדי שנוכל לקרוא ל-checkConnection

const PORT = process.env.PORT || 3000; // השתמש בפורט מהגדרות הסביבה או ברירת מחדל

// טען משתני סביבה לפני כל דבר אחר אם לא נעשה זאת ב-app.js באופן מותנה
// אם app.js כבר טוען dotenv, ודא שהסדר נכון.
// אם ב-db.js יש require('dotenv'), והוא מיובא לפני ש-app.js טוען dotenv מותנה,
// ייתכן ש-process.env עדיין לא יהיה מאוכלס לחלוטין עבור db.js בזמן הייבוא.
// הגישה הבטוחה ביותר היא לטעון dotenv פעם אחת כאן, בתחילת server.js,
// ולהסיר את הקריאות ל-dotenv.config() מ-app.js ומ-db.js.

// אם אתה משתמש ב-db.checkConnection(), אתה יכול לקרוא לה כאן:
const startServer = async () => {
  try {
    if (db.checkConnection) { // בדוק אם הפונקציה קיימת לפני קריאה
      await db.checkConnection(); // ודא שבסיס הנתונים מחובר
    }
    app.listen(PORT, () => {
      console.log(`Bashrometer API running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server or connect to DB:', error);
    process.exit(1); // צא אם השרת לא יכול לעלות בגלל בעיית DB
  }
};

startServer();
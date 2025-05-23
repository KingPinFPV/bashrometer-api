// jest.config.js
module.exports = {
  testEnvironment: 'node', // סביבת ההרצה היא Node.js
  coveragePathIgnorePatterns: [ // נתיבים להתעלם מהם בכיסוי קוד
    '/node_modules/',
    '/config/', // בדרך כלל לא בודקים קבצי קונפיגורציה ישירות
  ],
  // אפשר להוסיף כאן setupFilesAfterEnv אם נרצה קובץ הרצה לפני כל בדיקה
  // למשל, לניקוי DB או הגדרות גלובליות
  setupFilesAfterEnv: ['./jest.setup.js'], 
  testTimeout: 30000, // הגדלת הזמן המקסימלי לבדיקה (שימושי לבדיקות API)
};
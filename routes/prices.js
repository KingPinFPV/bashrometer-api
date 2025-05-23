// routes/prices.js 
const express = require('express'); 
const router = express.Router(); 
const pricesController = require('../controllers/pricesController'); 
// ודא שאתה מייבא גם את authorizeRole אם אתה מתכוון להשתמש בו להרשאות מורכבות יותר
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware'); 

// GET /api/prices - Get all prices with filtering, sorting, and pagination
// הוספתי authenticateToken כדי שנוכל לקבל את req.user ולבדוק current_user_liked
// אם אתה רוצה שנתיב זה יהיה ציבורי לחלוטין (גם למשתמשים לא מחוברים), אפשר להסיר את authenticateToken מכאן,
// אבל אז לא תוכל לדעת מי המשתמש השולף עבור current_user_liked ב-getAllPrices.
// פתרון אחר הוא להפוך את authenticateToken ל"אופציונלי" (שימלא את req.user אם יש טוקן, ולא יזרוק שגיאה אם אין).
router.get('/', authenticateToken, pricesController.getAllPrices); 

// POST /api/prices - Submit a new price report or update existing 
router.post('/', authenticateToken, pricesController.createPriceReport); 

// GET /api/prices/:id - Get a specific price entry by ID
// הוספתי authenticateToken כדי שנוכל לקבל את req.user ל-current_user_liked
router.get('/:id', authenticateToken, pricesController.getPriceById); 

// PUT /api/prices/:id - Update an existing price entry 
// כאן צריך לוודא שבתוך pricesController.updatePrice יש בדיקת הרשאות
// (שבעל הדיווח או אדמין יכולים לעדכן)
router.put('/:id', authenticateToken, pricesController.updatePrice); 

// DELETE /api/prices/:id - Delete a price entry 
// כאן צריך לוודא שבתוך pricesController.deletePrice יש בדיקת הרשאות
router.delete('/:id', authenticateToken, pricesController.deletePrice); 

// --- Like/Unlike Routes --- 
router.post('/:priceId/like', authenticateToken, pricesController.likePriceReport); 
router.delete('/:priceId/like', authenticateToken, pricesController.unlikePriceReport); 


// --- נתיב חדש לעדכון סטטוס דיווח על ידי אדמין --- 
router.put( 
    '/:priceId/status', // או /:id/status אם אתה מעדיף עקביות עם שאר הנתיבים ל-ID יחיד
    authenticateToken, 
    authorizeRole(['admin']), // רק אדמין יכול לשנות סטטוס 
    pricesController.updatePriceReportStatus 
); 

module.exports = router;
// routes/products.js (או productsRoutes.js, התאם לשם הקובץ שלך)
const express = require('express');
const router = express.Router();
const productController = require('../controllers/productsController');

// ייבא את ה-middlewares שלך. ודא שהנתיבים והשמות נכונים.
// אני מניח שהקובץ authMiddleware.js מייצא את שתי הפונקציות.
// אם הפונקציה לאימות טוקן נקראת אחרת (למשל, רק authMiddleware), שנה בהתאם.
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware'); 

// === נתיבים קיימים (לקריאה בלבד, לרוב פתוחים או דורשים רק אימות בסיסי) ===

// GET /api/products - שליפת כל המוצרים (עם פילטור, מיון, עימוד)
router.get('/', productController.getAllProducts);

// GET /api/products/:id - שליפת מוצר יחיד לפי ID
router.get('/:id', productController.getProductById);


// === נתיבי CRUD חדשים למוצרים (דורשים הרשאות אדמין) ===

// POST /api/products - יצירת מוצר חדש (אדמין בלבד)
router.post(
    '/', 
    authenticateToken, // ודא שהמשתמש מחובר
    authorizeRole(['admin']), // ודא שהמשתמש הוא אדמין
    productController.createProduct 
);

// PUT /api/products/:id - עדכון מוצר קיים (אדמין בלבד)
router.put(
    '/:id', 
    authenticateToken, 
    authorizeRole(['admin']), 
    productController.updateProduct
);

// DELETE /api/products/:id - מחיקת מוצר קיים (אדמין בלבד)
router.delete(
    '/:id', 
    authenticateToken, 
    authorizeRole(['admin']), 
    productController.deleteProduct
);

module.exports = router;
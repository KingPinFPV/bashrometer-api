// routes/retailers.js (או retailerRoutes.js, התאם לשם הקובץ שלך)
const express = require('express');
const router = express.Router();
const retailerController = require('../controllers/retailersController'); // ודא שהשם נכון
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

// GET /api/retailers - שליפת כל הקמעונאים (פתוח לכולם, אולי עם סינון שונה לאדמין)
router.get('/', retailerController.getAllRetailers);

// GET /api/retailers/:id - שליפת קמעונאי יחיד (פתוח לכולם)
router.get('/:id', retailerController.getRetailerById);

// POST /api/retailers - יצירת קמעונאי חדש (אדמין בלבד)
router.post(
    '/',
    authenticateToken,
    authorizeRole(['admin']),
    retailerController.createRetailer
);

// PUT /api/retailers/:id - עדכון קמעונאי קיים (אדמין בלבד)
router.put(
    '/:id',
    authenticateToken,
    authorizeRole(['admin']),
    retailerController.updateRetailer
);

// DELETE /api/retailers/:id - מחיקת קמעונאי קיים (אדמין בלבד)
router.delete(
    '/:id',
    authenticateToken,
    authorizeRole(['admin']),
    retailerController.deleteRetailer
);

module.exports = router;
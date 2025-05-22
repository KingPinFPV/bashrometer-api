// routes/prices.js
const express = require('express');
const router = express.Router();
const pricesController = require('../controllers/pricesController');
const { authenticateToken } = require('../middleware/authMiddleware'); // authorizeRole יכול להיות מיובא אם משתמשים בו

// GET /api/prices - Get all prices with filtering, sorting, and pagination
router.get('/', pricesController.getAllPrices);

// POST /api/prices - Submit a new price report or update existing
router.post('/', authenticateToken, pricesController.createPriceReport);

// GET /api/prices/:id - Get a specific price entry by ID
router.get('/:id', pricesController.getPriceById);

// PUT /api/prices/:id - Update an existing price entry
router.put('/:id', authenticateToken, pricesController.updatePrice);

// DELETE /api/prices/:id - Delete a price entry
router.delete('/:id', authenticateToken, pricesController.deletePrice);

// --- Like/Unlike Routes ---
// @route   POST /api/prices/:priceId/like
// @desc    Like a price report
// @access  Private (requires user to be logged in)
router.post('/:priceId/like', authenticateToken, pricesController.likePriceReport);

// @route   DELETE /api/prices/:priceId/like
// @desc    Unlike a price report
// @access  Private (requires user to be logged in)
router.delete('/:priceId/like', authenticateToken, pricesController.unlikePriceReport);


module.exports = router;
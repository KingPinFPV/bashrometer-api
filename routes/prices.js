// routes/prices.js
const express = require('express');
const router = express.Router();
const pricesController = require('../controllers/pricesController');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware'); // Assuming authorizeRole might be used later

// @route   GET /api/prices
// @desc    Get all prices with filtering, sorting, and pagination
// @access  Public (or authenticated, depending on requirements)
router.get('/', pricesController.getAllPrices);

// @route   POST /api/prices
// @desc    Submit a new price report
// @access  Private (requires user to be logged in)
router.post('/', authenticateToken, pricesController.createPriceReport);

// @route   GET /api/prices/:id
// @desc    Get a specific price entry by ID
// @access  Public
router.get('/:id', pricesController.getPriceById);

// @route   PUT /api/prices/:id
// @desc    Update an existing price entry
// @access  Private (requires user to be logged in and own the report, or be an admin)
router.put('/:id', authenticateToken, pricesController.updatePrice);

// @route   DELETE /api/prices/:id
// @desc    Delete a price entry
// @access  Private (requires user to be logged in and own the report, or be an admin)
router.delete('/:id', authenticateToken, pricesController.deletePrice);

// Example of a route that might require a specific role (e.g., admin to approve prices)
// router.patch('/:id/status', authenticateToken, authorizeRole('admin'), pricesController.updatePriceStatus);

module.exports = router;
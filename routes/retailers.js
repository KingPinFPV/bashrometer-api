// routes/retailers.js
const express = require('express');
const router = express.Router();
const retailersController = require('../controllers/retailersController');
// const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware'); // Uncomment if specific routes need protection

// @route   GET /api/retailers
// @desc    Get all active retailers (potentially with filtering)
// @access  Public
router.get('/', retailersController.getAllRetailers);

// @route   GET /api/retailers/:id
// @desc    Get a single retailer by ID
// @access  Public
router.get('/:id', retailersController.getRetailerById);

// --- Future Admin Routes (example - would require protection) ---
// @route   POST /api/retailers
// @desc    Create a new retailer (Admin only)
// @access  Private (Admin)
// router.post('/', authenticateToken, authorizeRole('admin'), retailersController.createRetailer);

// @route   PUT /api/retailers/:id
// @desc    Update a retailer (Admin only)
// @access  Private (Admin)
// router.put('/:id', authenticateToken, authorizeRole('admin'), retailersController.updateRetailer);

// @route   DELETE /api/retailers/:id
// @desc    Delete a retailer (Admin only)
// @access  Private (Admin)
// router.delete('/:id', authenticateToken, authorizeRole('admin'), retailersController.deleteRetailer);

module.exports = router;
// routes/products.js
const express = require('express');
const router = express.Router();
const productsController = require('../controllers/productsController');
// const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware'); // Uncomment if specific routes need protection

// @route   GET /api/products
// @desc    Get all active products (potentially with filtering)
// @access  Public
router.get('/', productsController.getAllProducts);

// @route   GET /api/products/:id
// @desc    Get a single product by ID with price examples
// @access  Public
router.get('/:id', productsController.getProductById);

// --- Future Admin Routes (example - would require protection) ---
// @route   POST /api/products
// @desc    Create a new product (Admin only)
// @access  Private (Admin)
// router.post('/', authenticateToken, authorizeRole('admin'), productsController.createProduct);

// @route   PUT /api/products/:id
// @desc    Update a product (Admin only)
// @access  Private (Admin)
// router.put('/:id', authenticateToken, authorizeRole('admin'), productsController.updateProduct);

// @route   DELETE /api/products/:id
// @desc    Delete a product (Admin only)
// @access  Private (Admin)
// router.delete('/:id', authenticateToken, authorizeRole('admin'), productsController.deleteProduct);

module.exports = router;
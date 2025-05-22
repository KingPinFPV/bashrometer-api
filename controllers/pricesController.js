// controllers/pricesController.js
const pool = require('../db');
const { calcPricePer100g } = require('../utils/priceCalculator');

// Helper function to fetch a single price entry with all necessary details for display or calculation
async function getFullPriceDetails(priceId) {
  const query = `
    SELECT 
      pr.id, pr.product_id, p.name as product_name, 
      pr.retailer_id, r.name as retailer_name,
      pr.user_id, u.name as user_name,
      pr.price_submission_date, pr.price_valid_from, pr.price_valid_to,
      pr.unit_for_price, pr.quantity_for_price, 
      pr.regular_price, pr.sale_price, pr.is_on_sale,
      pr.source, pr.report_type, pr.status, pr.notes,
      pr.created_at, pr.updated_at,
      p.default_weight_per_unit_grams
    FROM prices pr
    JOIN products p ON pr.product_id = p.id
    JOIN retailers r ON pr.retailer_id = r.id
    LEFT JOIN users u ON pr.user_id = u.id
    WHERE pr.id = $1
  `;
  const result = await pool.query(query, [priceId]);
  return result.rows[0];
}


// GET /api/prices
// Get all prices with filtering, sorting, and pagination
exports.getAllPrices = async (req, res) => {
  const {
    product_id, retailer_id, date_from, date_to, on_sale, status,
    min_price, max_price, // These are for calculated_price_per_100g
    limit = 10, offset = 0,
    sort_by = 'price_submission_date', order = 'DESC'
  } = req.query;

  let queryParams = [];
  let paramIndex = 1;

  let baseQuery = `
    SELECT 
      pr.id, pr.product_id, p.name as product_name, 
      pr.retailer_id, r.name as retailer_name,
      pr.user_id, u.name as user_name,
      pr.price_submission_date, pr.price_valid_from, pr.price_valid_to,
      pr.unit_for_price, pr.quantity_for_price, 
      pr.regular_price, pr.sale_price, pr.is_on_sale,
      pr.source, pr.report_type, pr.status, pr.notes,
      pr.created_at, pr.updated_at,
      p.default_weight_per_unit_grams 
    FROM prices pr
    JOIN products p ON pr.product_id = p.id
    JOIN retailers r ON pr.retailer_id = r.id
    LEFT JOIN users u ON pr.user_id = u.id
    WHERE 1=1 
  `;

  if (product_id) {
    baseQuery += ` AND pr.product_id = $${paramIndex++}`;
    queryParams.push(parseInt(product_id));
  }
  if (retailer_id) {
    baseQuery += ` AND pr.retailer_id = $${paramIndex++}`;
    queryParams.push(parseInt(retailer_id));
  }
  if (date_from) {
    baseQuery += ` AND pr.price_submission_date >= $${paramIndex++}`;
    queryParams.push(date_from);
  }
  if (date_to) {
    baseQuery += ` AND pr.price_submission_date <= $${paramIndex++}`;
    queryParams.push(date_to);
  }
  if (on_sale !== undefined) {
    baseQuery += ` AND pr.is_on_sale = $${paramIndex++}`;
    queryParams.push(on_sale === 'true');
  }
  if (status) {
    baseQuery += ` AND pr.status = $${paramIndex++}`;
    queryParams.push(status);
  }

  const validSortColumns = {
    'price_submission_date': 'pr.price_submission_date',
    'regular_price': 'pr.regular_price',
    'product_name': 'p.name',
    'retailer_name': 'r.name'
  };
  const sortColumn = validSortColumns[sort_by] || 'pr.price_submission_date';
  const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  
  // Count query for total items (without pagination, but with filters)
  const countQuery = `SELECT COUNT(*) FROM prices pr JOIN products p ON pr.product_id = p.id JOIN retailers r ON pr.retailer_id = r.id ${baseQuery.substring(baseQuery.indexOf("WHERE"))}`;
  
  baseQuery += ` ORDER BY ${sortColumn} ${sortOrder}`;
  baseQuery += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  queryParams.push(parseInt(limit));
  queryParams.push(parseInt(offset));

  try {
    const totalCountResult = await pool.query(countQuery, queryParams.slice(0, paramIndex - 3)); // Exclude limit and offset params for count
    const totalCount = parseInt(totalCountResult.rows[0].count);
    
    const result = await pool.query(baseQuery, queryParams);

    const pricesWithCalc = result.rows.map(row => {
      const calculated_price_per_100g_raw = calcPricePer100g({
        regular_price: parseFloat(row.regular_price),
        sale_price: row.sale_price ? parseFloat(row.sale_price) : null,
        unit_for_price: row.unit_for_price,
        quantity_for_price: parseFloat(row.quantity_for_price),
        default_weight_per_unit_grams: row.default_weight_per_unit_grams ? parseFloat(row.default_weight_per_unit_grams) : null
      });
      const { default_weight_per_unit_grams, ...priceData } = row; // Exclude helper field
      return {
        ...priceData,
        calculated_price_per_100g: calculated_price_per_100g_raw !== null ? parseFloat(calculated_price_per_100g_raw.toFixed(2)) : null
      };
    });
    
    let filteredByCalcPrice = pricesWithCalc;
    if (min_price !== undefined) {
        filteredByCalcPrice = filteredByCalcPrice.filter(p => p.calculated_price_per_100g !== null && p.calculated_price_per_100g >= parseFloat(min_price));
    }
    if (max_price !== undefined) {
        filteredByCalcPrice = filteredByCalcPrice.filter(p => p.calculated_price_per_100g !== null && p.calculated_price_per_100g <= parseFloat(max_price));
    }

    res.json({
        data: filteredByCalcPrice,
        page_info: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            total_items: totalCount,
            current_page_count: filteredByCalcPrice.length 
        }
    });

  } catch (err) {
    console.error('Error in getAllPrices:', err.message, err.stack);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
};

// GET /api/prices/:id
// Get a specific price entry by ID
exports.getPriceById = async (req, res) => {
  const { id } = req.params;
  try {
    const priceEntry = await getFullPriceDetails(id);

    if (!priceEntry) {
      return res.status(404).json({ error: 'Price entry not found' });
    }

    const calculated_price_per_100g_raw = calcPricePer100g({
      regular_price: parseFloat(priceEntry.regular_price),
      sale_price: priceEntry.sale_price ? parseFloat(priceEntry.sale_price) : null,
      unit_for_price: priceEntry.unit_for_price,
      quantity_for_price: parseFloat(priceEntry.quantity_for_price),
      default_weight_per_unit_grams: priceEntry.default_weight_per_unit_grams ? parseFloat(priceEntry.default_weight_per_unit_grams) : null
    });

    const { default_weight_per_unit_grams, ...responseEntry } = priceEntry;

    res.json({
      ...responseEntry,
      calculated_price_per_100g: calculated_price_per_100g_raw !== null ? parseFloat(calculated_price_per_100g_raw.toFixed(2)) : null
    });
  } catch (err) {
    console.error(`Error in getPriceById (id: ${id}):`, err.message, err.stack);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
};

// POST /api/prices
// Submit a new price report (requires authentication)
exports.createPriceReport = async (req, res) => {
  const {
    product_id, retailer_id,
    price_submission_date = new Date().toISOString().slice(0, 10),
    price_valid_from, price_valid_to, unit_for_price,
    quantity_for_price = 1, regular_price, sale_price,
    is_on_sale = false, source, report_type, status, // status can be overridden by body, otherwise DB default
    notes
  } = req.body;

  const userIdFromToken = req.user.id; // User ID from authenticated token (authMiddleware)

  // Basic Validation
  if (!product_id || !retailer_id || !unit_for_price || !regular_price || !source) {
    return res.status(400).json({ error: 'Missing required fields. Required: product_id, retailer_id, unit_for_price, regular_price, source.' });
  }
  if (isNaN(parseFloat(regular_price)) || parseFloat(regular_price) <= 0) {
    return res.status(400).json({ error: 'Invalid regular_price. Must be a positive number.' });
  }
  if (sale_price && (isNaN(parseFloat(sale_price)) || parseFloat(sale_price) <= 0)) {
    return res.status(400).json({ error: 'Invalid sale_price. Must be a positive number if provided.' });
  }
  if (sale_price && parseFloat(sale_price) > parseFloat(regular_price)) {
    return res.status(400).json({ error: 'Sale price cannot be greater than regular price.' });
  }
  if (is_on_sale && !sale_price) {
    return res.status(400).json({ error: 'If is_on_sale is true, sale_price must be provided.' });
  }

  const insertQuery = `
    INSERT INTO prices (
      product_id, retailer_id, user_id, price_submission_date, price_valid_from, price_valid_to,
      unit_for_price, quantity_for_price, regular_price, sale_price, is_on_sale,
      source, report_type, status, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING id; 
  `;
  const queryParams = [
    product_id, retailer_id, userIdFromToken, price_submission_date, price_valid_from || null, price_valid_to || null,
    unit_for_price, quantity_for_price, regular_price, sale_price || null, is_on_sale,
    source, report_type || null, status, notes || null // status will use DB default if not provided or null
  ];

  try {
    const result = await pool.query(insertQuery, queryParams);
    const newPriceId = result.rows[0].id;
    const newPriceEntry = await getFullPriceDetails(newPriceId); // Fetch the full new entry

    const calculated_price_per_100g_raw = calcPricePer100g({
      regular_price: parseFloat(newPriceEntry.regular_price),
      sale_price: newPriceEntry.sale_price ? parseFloat(newPriceEntry.sale_price) : null,
      unit_for_price: newPriceEntry.unit_for_price,
      quantity_for_price: parseFloat(newPriceEntry.quantity_for_price),
      default_weight_per_unit_grams: newPriceEntry.default_weight_per_unit_grams ? parseFloat(newPriceEntry.default_weight_per_unit_grams) : null
    });
    
    const { default_weight_per_unit_grams, ...responseEntry } = newPriceEntry;

    res.status(201).json({
      ...responseEntry,
      calculated_price_per_100g: calculated_price_per_100g_raw !== null ? parseFloat(calculated_price_per_100g_raw.toFixed(2)) : null
    });

  } catch (err) {
    console.error('Error in createPriceReport:', err.message, err.stack);
    if (err.code === '23503') { // Foreign key violation
        return res.status(400).json({ error: 'Invalid product_id or retailer_id. Resource not found.', details: err.message });
    }
    // Add more specific error handling for other DB constraints (e.g., CHECK violations - code 23514)
    res.status(500).json({ error: 'Database error while creating price report.', details: err.message });
  }
};

// PUT /api/prices/:id
// Update an existing price entry (requires authentication and ownership/admin role)
exports.updatePrice = async (req, res) => {
  const { id: priceId } = req.params;
  const updates = req.body;
  const loggedInUser = req.user;

  const allowedUpdates = [
    'price_valid_from', 'price_valid_to', 'unit_for_price', 'quantity_for_price',
    'regular_price', 'sale_price', 'is_on_sale', 'source', 'report_type', 'status', 'notes'
  ];

  const updateFields = [];
  const queryParams = []; // Will hold values for SET clauses
  let paramIndex = 1; 

  for (const key in updates) {
    if (allowedUpdates.includes(key)) {
      updateFields.push(`${key} = $${paramIndex++}`);
      queryParams.push(updates[key]);
    }
  }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'No valid fields provided for update.' });
  }
  
  // Add more validation for updated fields as needed (similar to POST)

  queryParams.push(priceId); // Add priceId as the last parameter for WHERE clause
  const whereClauseParamIndex = paramIndex;

  try {
    const originalPriceEntry = await pool.query('SELECT user_id FROM prices WHERE id = $1', [priceId]);
    if (originalPriceEntry.rows.length === 0) {
      return res.status(404).json({ error: 'Price entry not found.' });
    }

    if (originalPriceEntry.rows[0].user_id !== loggedInUser.id && loggedInUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to update this price entry.' });
    }

    const updateQuery = `
      UPDATE prices
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${whereClauseParamIndex}
      RETURNING id;
    `;

    const result = await pool.query(updateQuery, queryParams);
    if (result.rows.length === 0) {
      // Should be caught by the 404 above, but as a safeguard
      return res.status(404).json({ error: 'Price entry not found or no update performed.' });
    }
    
    const updatedPriceEntry = await getFullPriceDetails(result.rows[0].id);
     const calculated_price_per_100g_raw = calcPricePer100g({
      regular_price: parseFloat(updatedPriceEntry.regular_price),
      sale_price: updatedPriceEntry.sale_price ? parseFloat(updatedPriceEntry.sale_price) : null,
      unit_for_price: updatedPriceEntry.unit_for_price,
      quantity_for_price: parseFloat(updatedPriceEntry.quantity_for_price),
      default_weight_per_unit_grams: updatedPriceEntry.default_weight_per_unit_grams ? parseFloat(updatedPriceEntry.default_weight_per_unit_grams) : null
    });
    
    const { default_weight_per_unit_grams, ...responseEntry } = updatedPriceEntry;
    
    res.json({
        ...responseEntry,
        calculated_price_per_100g: calculated_price_per_100g_raw !== null ? parseFloat(calculated_price_per_100g_raw.toFixed(2)) : null
    });

  } catch (err) {
    console.error(`Error in updatePrice (id: ${priceId}):`, err.message, err.stack);
    res.status(500).json({ error: 'Database error while updating price entry.', details: err.message });
  }
};

// DELETE /api/prices/:id
// Delete a price entry (requires authentication and ownership/admin role)
exports.deletePrice = async (req, res) => {
  const { id: priceId } = req.params;
  const loggedInUser = req.user;

  try {
    const originalPriceEntry = await pool.query('SELECT user_id FROM prices WHERE id = $1', [priceId]);
    if (originalPriceEntry.rows.length === 0) {
      return res.status(404).json({ error: 'Price entry not found.' });
    }

    if (originalPriceEntry.rows[0].user_id !== loggedInUser.id && loggedInUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to delete this price entry.' });
    }

    const result = await pool.query('DELETE FROM prices WHERE id = $1 RETURNING id;', [priceId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Price entry not found or already deleted.' });
    }

    res.status(204).send();
  } catch (err) {
    console.error(`Error in deletePrice (id: ${priceId}):`, err.message, err.stack);
    res.status(500).json({ error: 'Database error while deleting price entry.', details: err.message });
  }
};
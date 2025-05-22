// controllers/pricesController.js
const pool = require('../db');
const { calcPricePer100g } = require('../utils/priceCalculator');

// Helper function to fetch a single price entry with all necessary details for display or calculation
const getFullPriceDetails = async (priceId) => { // <--- שים לב: הוגדר כ-const
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
};


// GET /api/prices
const getAllPrices = async (req, res) => { // <--- שים לב: הוגדר כ-const
  const {
    product_id, retailer_id, date_from, date_to, on_sale, status,
    min_price, max_price, 
    limit = 10, offset = 0,
    sort_by = 'price_submission_date', order = 'DESC'
  } = req.query;

  let queryParams = [];
  let queryParamsForCount = [];
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
  `;
  let whereClauses = " WHERE 1=1 "; 

  if (product_id) {
    whereClauses += ` AND pr.product_id = $${paramIndex}`;
    queryParams.push(parseInt(product_id));
    queryParamsForCount.push(parseInt(product_id));
    paramIndex++;
  }
  if (retailer_id) {
    whereClauses += ` AND pr.retailer_id = $${paramIndex}`;
    queryParams.push(parseInt(retailer_id));
    queryParamsForCount.push(parseInt(retailer_id));
    paramIndex++;
  }
  if (date_from) {
    whereClauses += ` AND pr.price_submission_date >= $${paramIndex}`;
    queryParams.push(date_from);
    queryParamsForCount.push(date_from);
    paramIndex++;
  }
  if (date_to) {
    whereClauses += ` AND pr.price_submission_date <= $${paramIndex}`;
    queryParams.push(date_to);
    queryParamsForCount.push(date_to);
    paramIndex++;
  }
  if (on_sale !== undefined) {
    whereClauses += ` AND pr.is_on_sale = $${paramIndex}`;
    queryParams.push(on_sale === 'true');
    queryParamsForCount.push(on_sale === 'true');
    paramIndex++;
  }
  if (status) {
    whereClauses += ` AND pr.status = $${paramIndex}`;
    queryParams.push(status);
    queryParamsForCount.push(status);
    paramIndex++;
  }
  
  baseQuery += whereClauses;

  const validSortColumns = {
    'price_submission_date': 'pr.price_submission_date',
    'regular_price': 'pr.regular_price',
    'product_name': 'p.name',
    'retailer_name': 'r.name'
  };
  const sortColumn = validSortColumns[sort_by] || 'pr.price_submission_date';
  const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  
  const countQuery = `SELECT COUNT(*) FROM prices pr JOIN products p ON pr.product_id = p.id JOIN retailers r ON pr.retailer_id = r.id LEFT JOIN users u ON pr.user_id = u.id ${whereClauses}`;
  
  baseQuery += ` ORDER BY ${sortColumn} ${sortOrder}`;
  
  const finalQueryParamsForData = [...queryParams];
  baseQuery += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  finalQueryParamsForData.push(parseInt(limit));
  finalQueryParamsForData.push(parseInt(offset));

  try {
    const totalCountResult = await pool.query(countQuery, queryParamsForCount);
    const totalCount = parseInt(totalCountResult.rows[0].count);
    
    const result = await pool.query(baseQuery, finalQueryParamsForData);

    const pricesWithCalc = result.rows.map(row => {
      const calculated_price_per_100g_raw = calcPricePer100g({
        regular_price: parseFloat(row.regular_price),
        sale_price: row.sale_price ? parseFloat(row.sale_price) : null,
        unit_for_price: row.unit_for_price,
        quantity_for_price: parseFloat(row.quantity_for_price),
        default_weight_per_unit_grams: row.default_weight_per_unit_grams ? parseFloat(row.default_weight_per_unit_grams) : null
      });
      const { default_weight_per_unit_grams, ...priceData } = row;
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
    res.status(500).json({ error: 'Database error while fetching prices', details: err.message });
  }
};

// GET /api/prices/:id
const getPriceById = async (req, res) => { // <--- שים לב: הוגדר כ-const
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
    res.status(500).json({ error: 'Database error while fetching price entry', details: err.message });
  }
};

// POST /api/prices - Creates new or updates existing price report
const createPriceReport = async (req, res) => { // <--- שים לב: הוגדר כ-const
  const {
    product_id, retailer_id,
    price_submission_date = new Date().toISOString().slice(0, 10),
    price_valid_from, price_valid_to, unit_for_price,
    quantity_for_price = 1, regular_price, sale_price,
    is_on_sale = false, source, report_type, 
    status: statusFromBody,
    notes
  } = req.body;

  const userIdFromToken = req.user.id;

  // Basic Validation (same as before)
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

  const finalStatus = statusFromBody !== undefined ? statusFromBody : 'approved';

  try {
    const existingPriceQuery = `
      SELECT id FROM prices 
      WHERE product_id = $1 AND retailer_id = $2 AND user_id = $3
      ORDER BY price_submission_date DESC, created_at DESC 
      LIMIT 1;
    `;
    const existingPriceResult = await pool.query(existingPriceQuery, [product_id, retailer_id, userIdFromToken]);

    let priceEntryId;
    let statusCode = 201; 
    let successMessage = 'Price report created successfully.';

    if (existingPriceResult.rows.length > 0) {
      priceEntryId = existingPriceResult.rows[0].id;
      statusCode = 200; 
      successMessage = 'Price report updated successfully.';

      const updateFields = [];
      const queryParamsForUpdate = [];
      let paramIndexUpdate = 1;

      if (price_submission_date !== undefined) { updateFields.push(`price_submission_date = $${paramIndexUpdate++}`); queryParamsForUpdate.push(price_submission_date); }
      updateFields.push(`price_valid_from = $${paramIndexUpdate++}`); queryParamsForUpdate.push(price_valid_from || null);
      updateFields.push(`price_valid_to = $${paramIndexUpdate++}`); queryParamsForUpdate.push(price_valid_to || null);
      if (unit_for_price !== undefined) { updateFields.push(`unit_for_price = $${paramIndexUpdate++}`); queryParamsForUpdate.push(unit_for_price); }
      if (quantity_for_price !== undefined) { updateFields.push(`quantity_for_price = $${paramIndexUpdate++}`); queryParamsForUpdate.push(quantity_for_price); }
      if (regular_price !== undefined) { updateFields.push(`regular_price = $${paramIndexUpdate++}`); queryParamsForUpdate.push(regular_price); }
      updateFields.push(`sale_price = $${paramIndexUpdate++}`); queryParamsForUpdate.push(sale_price || null);
      if (is_on_sale !== undefined) { updateFields.push(`is_on_sale = $${paramIndexUpdate++}`); queryParamsForUpdate.push(is_on_sale); }
      if (source !== undefined) { updateFields.push(`source = $${paramIndexUpdate++}`); queryParamsForUpdate.push(source); }
      if (report_type !== undefined) { updateFields.push(`report_type = $${paramIndexUpdate++}`); queryParamsForUpdate.push(report_type || null); }
      if (finalStatus !== undefined) { updateFields.push(`status = $${paramIndexUpdate++}`); queryParamsForUpdate.push(finalStatus); }
      updateFields.push(`notes = $${paramIndexUpdate++}`); queryParamsForUpdate.push(notes || null);
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      
      queryParamsForUpdate.push(priceEntryId);

      if (updateFields.length > 1) { 
        const updateQuery = `
          UPDATE prices SET ${updateFields.join(', ')}
          WHERE id = $${paramIndexUpdate} 
          RETURNING id;
        `;
        await pool.query(updateQuery, queryParamsForUpdate);
      }
    } else {
      const insertQuery = `
        INSERT INTO prices (
          product_id, retailer_id, user_id, price_submission_date, price_valid_from, price_valid_to,
          unit_for_price, quantity_for_price, regular_price, sale_price, is_on_sale,
          source, report_type, status, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id; 
      `;
      const queryParamsForInsert = [
        product_id, retailer_id, userIdFromToken, price_submission_date, price_valid_from || null, price_valid_to || null,
        unit_for_price, quantity_for_price, regular_price, sale_price || null, is_on_sale,
        source, report_type || null, finalStatus, notes || null
      ];
      const result = await pool.query(insertQuery, queryParamsForInsert);
      priceEntryId = result.rows[0].id;
    }

    const finalPriceEntry = await getFullPriceDetails(priceEntryId); 
    if (!finalPriceEntry) { 
        return res.status(500).json({ error: "Failed to retrieve price entry after submission." });
    }

    const calculated_price_per_100g_raw = calcPricePer100g({
      regular_price: parseFloat(finalPriceEntry.regular_price),
      sale_price: finalPriceEntry.sale_price ? parseFloat(finalPriceEntry.sale_price) : null,
      unit_for_price: finalPriceEntry.unit_for_price,
      quantity_for_price: parseFloat(finalPriceEntry.quantity_for_price),
      default_weight_per_unit_grams: finalPriceEntry.default_weight_per_unit_grams ? parseFloat(finalPriceEntry.default_weight_per_unit_grams) : null
    });
    
    const { default_weight_per_unit_grams, ...responseEntry } = finalPriceEntry;

    res.status(statusCode).json({
      message: successMessage,
      ...responseEntry,
      calculated_price_per_100g: calculated_price_per_100g_raw !== null ? parseFloat(calculated_price_per_100g_raw.toFixed(2)) : null
    });

  } catch (err) {
    console.error('Error in createPriceReport (upsert logic):', err.message, err.stack);
    if (err.code === '23503') { 
        return res.status(400).json({ error: 'Invalid product_id or retailer_id. Resource not found.', details: err.message });
    }
    if (err.code === '23514') { 
        return res.status(400).json({ error: 'Data validation error (e.g., invalid status or unit).', details: err.message });
    }
    res.status(500).json({ error: 'Database error during price report submission.', details: err.message });
  }
};

// PUT /api/prices/:id
const updatePrice = async (req, res) => { // <--- שים לב: הוגדר כ-const
  const { id: priceId } = req.params;
  const updates = req.body;
  const loggedInUser = req.user;

  const allowedUpdates = [
    'price_valid_from', 'price_valid_to', 'unit_for_price', 'quantity_for_price',
    'regular_price', 'sale_price', 'is_on_sale', 'source', 'report_type', 'status', 'notes'
  ];

  const updateFields = [];
  const queryParamsForSet = []; 
  let paramIndex = 1; 

  for (const key in updates) {
    if (allowedUpdates.includes(key)) {
      if (key === 'is_on_sale' && updates[key] === false) {
        updateFields.push(`${key} = $${paramIndex++}`);
        queryParamsForSet.push(false);
      } else if (updates[key] !== null && updates[key] !== undefined && updates[key] !== '') {
        updateFields.push(`${key} = $${paramIndex++}`);
        queryParamsForSet.push(updates[key]);
      } else if (updates[key] === null || updates[key] === '') {
         updateFields.push(`${key} = $${paramIndex++}`);
         queryParamsForSet.push(null);
      }
    }
  }

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'No valid fields provided for update or all fields were empty.' });
  }
  
  const finalQueryParams = [...queryParamsForSet, priceId]; 

  try {
    const originalPriceResult = await pool.query('SELECT user_id, status FROM prices WHERE id = $1', [priceId]);
    if (originalPriceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Price entry not found.' });
    }
    const originalPriceEntry = originalPriceResult.rows[0];

    if (originalPriceEntry.user_id !== loggedInUser.id && loggedInUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to update this price entry.' });
    }

    const updateQuery = `
      UPDATE prices
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} 
      RETURNING id; 
    `; 

    const result = await pool.query(updateQuery, finalQueryParams);
    if (result.rows.length === 0) {
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
        message: 'Price report updated successfully.',
        ...responseEntry,
        calculated_price_per_100g: calculated_price_per_100g_raw !== null ? parseFloat(calculated_price_per_100g_raw.toFixed(2)) : null
    });

  } catch (err) {
    console.error(`Error in updatePrice (id: ${priceId}):`, err.message, err.stack);
     if (err.code === '23514') { 
        return res.status(400).json({ error: 'Data validation error (e.g., invalid status or unit).', details: err.message });
    }
    res.status(500).json({ error: 'Database error while updating price entry.', details: err.message });
  }
};

// DELETE /api/prices/:id
const deletePrice = async (req, res) => { // <--- שים לב: הוגדר כ-const
  const { id: priceId } = req.params;
  const loggedInUser = req.user;

  try {
    const originalPriceResult = await pool.query('SELECT user_id FROM prices WHERE id = $1', [priceId]);
    if (originalPriceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Price entry not found.' });
    }
    const originalPriceEntry = originalPriceResult.rows[0];

    if (originalPriceEntry.user_id !== loggedInUser.id && loggedInUser.role !== 'admin') {
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

// ייצוא כל הפונקציות שהוגדרו כקבועים
module.exports = {
  getAllPrices,
  getPriceById,
  createPriceReport,
  updatePrice,
  deletePrice
};
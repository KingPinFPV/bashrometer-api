// controllers/pricesController.js
const pool = require('../db');
const { calcPricePer100g } = require('../utils/priceCalculator');

// Helper function to fetch a single price entry with all necessary details
const getFullPriceDetails = async (priceId, currentUserId = null) => {
  let query = `
    SELECT 
      pr.id, pr.product_id, p.name as product_name, 
      pr.retailer_id, r.name as retailer_name,
      pr.user_id, u.name as user_name, /* This is the user who reported the price */
      pr.price_submission_date, pr.price_valid_from, pr.price_valid_to,
      pr.unit_for_price, pr.quantity_for_price, 
      pr.regular_price, pr.sale_price, pr.is_on_sale,
      pr.source, pr.report_type, pr.status, pr.notes,
      pr.created_at, pr.updated_at,
      p.default_weight_per_unit_grams,
      (SELECT COUNT(*) FROM price_report_likes prl WHERE prl.price_id = pr.id) as likes_count
  `;
  const queryParams = [];

  if (currentUserId) {
    query += `,
      EXISTS (SELECT 1 FROM price_report_likes prl_user 
              WHERE prl_user.price_id = pr.id AND prl_user.user_id = $${queryParams.length + 2}) as current_user_liked
    `;
    queryParams.push(currentUserId); // This will be $2 if priceId is $1
  } else {
    query += `, FALSE as current_user_liked`;
  }
  
  query += `
    FROM prices pr
    JOIN products p ON pr.product_id = p.id
    JOIN retailers r ON pr.retailer_id = r.id
    LEFT JOIN users u ON pr.user_id = u.id
    WHERE pr.id = $1
  `;
  
  // Prepend priceId to the start of queryParams for the main WHERE clause
  queryParams.unshift(priceId); 

  try {
    const result = await pool.query(query, queryParams);
    if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
            ...row,
            likes_count: parseInt(row.likes_count, 10) || 0,
            // current_user_liked is already boolean from EXSISTS
        };
    }
    return null;
  } catch (error) {
    console.error("Error in getFullPriceDetails:", error);
    throw error; // Re-throw to be caught by calling function
  }
};


// GET /api/prices
const getAllPrices = async (req, res) => {
  const {
    product_id, retailer_id, date_from, date_to, on_sale, status,
    min_price, max_price, 
    limit = 10, offset = 0,
    sort_by = 'price_submission_date', order = 'DESC'
  } = req.query;

  const currentUserId = req.user ? req.user.id : null; // Get current user ID if available (for likes)

  let queryParams = [];
  let queryParamsForCount = [];
  let paramIndex = 1;

  let selectClause = `
    pr.id, pr.product_id, p.name as product_name, 
    pr.retailer_id, r.name as retailer_name,
    pr.user_id, u.name as user_name, /* Reporter user */
    pr.price_submission_date, pr.price_valid_from, pr.price_valid_to,
    pr.unit_for_price, pr.quantity_for_price, 
    pr.regular_price, pr.sale_price, pr.is_on_sale,
    pr.source, pr.report_type, pr.status, pr.notes,
    pr.created_at, pr.updated_at,
    p.default_weight_per_unit_grams,
    (SELECT COUNT(*) FROM price_report_likes prl WHERE prl.price_id = pr.id) as likes_count
  `;

  if (currentUserId) {
    selectClause += `,
      EXISTS (SELECT 1 FROM price_report_likes prl_user 
              WHERE prl_user.price_id = pr.id AND prl_user.user_id = $${paramIndex}) as current_user_liked
    `;
    // This parameter needs to be added to both queryParams and queryParamsForCount if used in WHERE
    // For SELECT clause, it's handled differently. Let's add it to the main queryParams for now.
    // And adjust paramIndex accordingly.
    queryParams.push(currentUserId);
    queryParamsForCount.push(currentUserId); // Add to count params if used in WHERE for count
    paramIndex++;
  } else {
    selectClause += `, FALSE as current_user_liked`;
  }
  
  let fromAndJoins = `
    FROM prices pr
    JOIN products p ON pr.product_id = p.id
    JOIN retailers r ON pr.retailer_id = r.id
    LEFT JOIN users u ON pr.user_id = u.id
  `;
  let whereClauses = " WHERE 1=1 "; 

  // Build WHERE clauses and add parameters to queryParams and queryParamsForCount
  const addFilter = (condition, value) => {
    whereClauses += ` AND ${condition.replace('?', `$${paramIndex}`)}`;
    queryParams.push(value);
    queryParamsForCount.push(value);
    paramIndex++;
  };

  if (product_id) addFilter('pr.product_id = ?', parseInt(product_id));
  if (retailer_id) addFilter('pr.retailer_id = ?', parseInt(retailer_id));
  if (date_from) addFilter('pr.price_submission_date >= ?', date_from);
  if (date_to) addFilter('pr.price_submission_date <= ?', date_to);
  if (on_sale !== undefined) addFilter('pr.is_on_sale = ?', on_sale === 'true');
  if (status) addFilter('pr.status = ?', status);
  
  let baseQuery = `SELECT ${selectClause} ${fromAndJoins} ${whereClauses}`;
  const countQuery = `SELECT COUNT(*) ${fromAndJoins} ${whereClauses}`;

  const validSortColumns = {
    'price_submission_date': 'pr.price_submission_date',
    'regular_price': 'pr.regular_price',
    'product_name': 'p.name',
    'retailer_name': 'r.name',
    'likes_count': 'likes_count' // Allow sorting by likes
  };
  const sortColumn = validSortColumns[sort_by] || 'pr.price_submission_date';
  const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  
  baseQuery += ` ORDER BY ${sortColumn} ${sortOrder}`;
  
  // Add pagination params only for the main data query
  const finalQueryParamsForData = [...queryParams]; // queryParams already built for WHERE
  baseQuery += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  finalQueryParamsForData.push(parseInt(limit));
  finalQueryParamsForData.push(parseInt(offset));
  
  // Adjust queryParamsForCount if currentUserId was added for SELECT but not WHERE
  let finalQueryParamsForCount = [...queryParamsForCount];
  if (currentUserId && !whereClauses.includes(`prl_user.user_id = $`)) { // A bit hacky, check if currentUserId was only for SELECT
      // This means currentUserId was added to queryParams but not queryParamsForCount if it wasn't part of a WHERE for count
      // Let's refine: if currentUserId is used only in SELECT, it shouldn't be in queryParamsForCount
      if (queryParams.includes(currentUserId) && !queryParamsForCount.includes(currentUserId) && queryParams.length > queryParamsForCount.length) {
          // This logic is getting complicated. Simpler: queryParamsForCount should only contain WHERE clause params
          // Rebuild paramIndex for count query if needed
      }
  }


  try {
    // The paramIndex for countQuery is based on number of '?' in whereClauses
    // Or simpler, just use queryParamsForCount directly
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
        likes_count: parseInt(priceData.likes_count, 10) || 0,
        current_user_liked: priceData.current_user_liked, // Should be boolean
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
const getPriceById = async (req, res) => {
  const { id } = req.params;
  const currentUserId = req.user ? req.user.id : null;
  try {
    const priceEntry = await getFullPriceDetails(id, currentUserId);

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
const createPriceReport = async (req, res) => {
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

  if (!product_id || !retailer_id || !unit_for_price || !regular_price || !source) { /* ... validation ... */ }
  // ... (rest of your existing validations)

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
      // Update logic (as provided in previous correct version)
      priceEntryId = existingPriceResult.rows[0].id;
      statusCode = 200; 
      successMessage = 'Price report updated successfully.';
      // ... (Full update logic as before, ensuring fields are only updated if provided)
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
          WHERE id = $${paramIndexUpdate} RETURNING id;`;
        await pool.query(updateQuery, queryParamsForUpdate);
      }
    } else {
      // Insert logic (as provided in previous correct version)
      const insertQuery = `
        INSERT INTO prices ( /* ... fields ... */ user_id, /* ... other fields ... */ status) 
        VALUES (/* ... values ... */ $3, /* ... other values ... */ $14) RETURNING id;`; // Ensure correct param count
      const queryParamsForInsert = [
        product_id, retailer_id, userIdFromToken, price_submission_date, price_valid_from || null, price_valid_to || null,
        unit_for_price, quantity_for_price, regular_price, sale_price || null, is_on_sale,
        source, report_type || null, finalStatus, notes || null
      ]; // Ensure this matches your INSERT statement fields and param numbers
      const result = await pool.query(insertQuery.replace(/\/\* ... fields ... \*\//, 
        `product_id, retailer_id, user_id, price_submission_date, price_valid_from, price_valid_to, unit_for_price, quantity_for_price, regular_price, sale_price, is_on_sale, source, report_type, status, notes`
      ).replace(/\/\* ... values ... \*\//g, '$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15'), queryParamsForInsert);
      priceEntryId = result.rows[0].id;
    }

    const finalPriceEntry = await getFullPriceDetails(priceEntryId, userIdFromToken); 
    if (!finalPriceEntry) {
        return res.status(500).json({ error: "Failed to retrieve price entry after submission." });
    }

    const calculated_price_per_100g_raw = calcPricePer100g({ /* ... */ }); // Use finalPriceEntry fields
    const { default_weight_per_unit_grams, ...responseEntry } = finalPriceEntry;
    res.status(statusCode).json({ message: successMessage, ...responseEntry, calculated_price_per_100g: calculated_price_per_100g_raw !== null ? parseFloat(calculated_price_per_100g_raw.toFixed(2)) : null });
  } catch (err) {
    console.error('Error in createPriceReport (upsert logic):', err.message, err.stack);
    // ... (error handling as before)
    res.status(500).json({ error: 'Database error during price report submission.', details: err.message });
  }
};

// PUT /api/prices/:id
const updatePrice = async (req, res) => {
  const { id: priceId } = req.params;
  const updates = req.body;
  const loggedInUser = req.user;
  const currentUserId = loggedInUser.id;


  // ... (allowedUpdates, updateFields, queryParamsForSet, paramIndex logic as before)
  const allowedUpdates = [ /* ... as before ... */ ];
  const updateFields = [];
  const queryParamsForSet = []; 
  let paramIndex = 1; 
  for (const key in updates) { /* ... as before ... */ }
  if (updateFields.length === 0) { /* ... as before ... */ }
  const finalQueryParams = [...queryParamsForSet, priceId]; 


  try {
    const originalPriceResult = await pool.query('SELECT user_id, status FROM prices WHERE id = $1', [priceId]);
    if (originalPriceResult.rows.length === 0) { /* ... as before ... */ }
    const originalPriceEntry = originalPriceResult.rows[0];
    if (originalPriceEntry.user_id !== loggedInUser.id && loggedInUser.role !== 'admin') { /* ... as before ... */ }

    const updateQuery = `
      UPDATE prices SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} RETURNING id;`; 
    const result = await pool.query(updateQuery, finalQueryParams);
    if (result.rows.length === 0) { /* ... as before ... */ }
    
    const updatedPriceEntry = await getFullPriceDetails(result.rows[0].id, currentUserId); // Pass currentUserId
    const calculated_price_per_100g_raw = calcPricePer100g({ /* ... use updatedPriceEntry fields ... */ });
    const { default_weight_per_unit_grams, ...responseEntry } = updatedPriceEntry;
    res.json({ message: 'Price report updated successfully.', ...responseEntry, calculated_price_per_100g: /* ... */ });
  } catch (err) {
    // ... (error handling as before)
    res.status(500).json({ error: 'Database error while updating price entry.', details: err.message });
  }
};

// DELETE /api/prices/:id
const deletePrice = async (req, res) => {
  // ... (logic as before, ensure loggedInUser and originalPriceResult are defined)
  const { id: priceId } = req.params;
  const loggedInUser = req.user;
  try {
    const originalPriceResult = await pool.query('SELECT user_id FROM prices WHERE id = $1', [priceId]);
    if (originalPriceResult.rows.length === 0) { return res.status(404).json({ error: 'Price entry not found.' });}
    const originalPriceEntry = originalPriceResult.rows[0];
    if (originalPriceEntry.user_id !== loggedInUser.id && loggedInUser.role !== 'admin') {return res.status(403).json({ error: 'Forbidden' });}
    const result = await pool.query('DELETE FROM prices WHERE id = $1 RETURNING id;', [priceId]);
    if (result.rowCount === 0) { return res.status(404).json({ error: 'Price entry not found or already deleted.' });}
    res.status(204).send();
  } catch (err) { /* ... error handling ... */ }
};

// --- Like/Unlike Functions ---
const likePriceReport = async (req, res) => {
  const { priceId } = req.params;
  const userId = req.user.id;

  try {
    const priceCheck = await pool.query('SELECT id FROM prices WHERE id = $1', [priceId]);
    if (priceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Price report not found.' });
    }
    await pool.query(
      'INSERT INTO price_report_likes (user_id, price_id) VALUES ($1, $2) ON CONFLICT (user_id, price_id) DO NOTHING', // Added ON CONFLICT
      [userId, parseInt(priceId)]
    );
    const likesCountResult = await pool.query('SELECT COUNT(*) FROM price_report_likes WHERE price_id = $1', [priceId]);
    const likesCount = parseInt(likesCountResult.rows[0].count);
    res.status(201).json({ message: 'Price report liked/already liked.', priceId: parseInt(priceId), userId, likesCount, userLiked: true });
  } catch (err) {
    // Removed 23505 check as ON CONFLICT handles it.
    if (err.code === '23503') { 
        return res.status(404).json({ error: 'Price report not found or user not found.' });
    }
    console.error('Error liking price report:', err.message, err.stack);
    res.status(500).json({ error: 'Server error while liking price report.', details: err.message });
  }
};

const unlikePriceReport = async (req, res) => {
  const { priceId } = req.params;
  const userId = req.user.id;

  try {
    const result = await pool.query(
      'DELETE FROM price_report_likes WHERE user_id = $1 AND price_id = $2 RETURNING *',
      [userId, parseInt(priceId)]
    );
    // No need to check result.rowCount if no error, if it didn't delete, it means no like existed from this user.
    const likesCountResult = await pool.query('SELECT COUNT(*) FROM price_report_likes WHERE price_id = $1', [priceId]);
    const likesCount = parseInt(likesCountResult.rows[0].count);
    res.status(200).json({ message: 'Price report unliked successfully (or was not liked by user).', priceId: parseInt(priceId), userId, likesCount, userLiked: false });
  } catch (err) {
    console.error('Error unliking price report:', err.message, err.stack);
    res.status(500).json({ error: 'Server error while unliking price report.', details: err.message });
  }
};

module.exports = {
  getAllPrices,
  getPriceById,
  createPriceReport,
  updatePrice,
  deletePrice,
  likePriceReport,
  unlikePriceReport
};
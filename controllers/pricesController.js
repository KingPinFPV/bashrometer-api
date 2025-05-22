// controllers/pricesController.js
const pool = require('../db');
const { calcPricePer100g } = require('../utils/priceCalculator');

// Helper function to fetch a single price entry with all necessary details
const getFullPriceDetails = async (priceId, currentUserId = null) => {
  let query = `
    SELECT 
      pr.id, pr.product_id, p.name as product_name, 
      pr.retailer_id, r.name as retailer_name,
      pr.user_id, u.name as user_name, 
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
    queryParams.push(currentUserId); 
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
  
  queryParams.unshift(priceId); 

  try {
    const result = await pool.query(query, queryParams);
    if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
            ...row,
            likes_count: parseInt(row.likes_count, 10) || 0,
        };
    }
    return null;
  } catch (error) {
    console.error("Error in getFullPriceDetails:", error);
    throw error; 
  }
};

const getAllPrices = async (req, res) => {
  const {
    product_id, retailer_id, date_from, date_to, on_sale, status,
    min_price, max_price, 
    limit = 10, offset = 0,
    sort_by = 'price_submission_date', order = 'DESC'
  } = req.query;

  const currentUserId = req.user ? req.user.id : null; 

  let queryParams = [];
  let queryParamsForCount = [];
  let paramIndexForWhere = 1; // For params used in WHERE clause (for count and main query)
  let paramIndexForSelect = 1; // For params used only in SELECT clause (for main query)

  let selectClause = `
    pr.id, pr.product_id, p.name as product_name, 
    pr.retailer_id, r.name as retailer_name,
    pr.user_id, u.name as user_name,
    pr.price_submission_date, pr.price_valid_from, pr.price_valid_to,
    pr.unit_for_price, pr.quantity_for_price, 
    pr.regular_price, pr.sale_price, pr.is_on_sale,
    pr.source, pr.report_type, pr.status, pr.notes,
    pr.created_at, pr.updated_at,
    p.default_weight_per_unit_grams,
    (SELECT COUNT(*) FROM price_report_likes prl WHERE prl.price_id = pr.id) as likes_count
  `;

  const selectParams = []; // Params only for the SELECT part of the main query

  if (currentUserId) {
    selectClause += `,
      EXISTS (SELECT 1 FROM price_report_likes prl_user 
              WHERE prl_user.price_id = pr.id AND prl_user.user_id = $${paramIndexForSelect}) as current_user_liked
    `;
    selectParams.push(currentUserId);
    paramIndexForSelect++;
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

  const addFilter = (condition, value) => {
    whereClauses += ` AND ${condition.replace('?', `$${paramIndexForWhere}`)}`;
    queryParamsForCount.push(value); // queryParamsForCount only gets WHERE clause params
    paramIndexForWhere++;
  };

  if (product_id) addFilter('pr.product_id = ?', parseInt(product_id));
  if (retailer_id) addFilter('pr.retailer_id = ?', parseInt(retailer_id));
  if (date_from) addFilter('pr.price_submission_date >= ?', date_from);
  if (date_to) addFilter('pr.price_submission_date <= ?', date_to);
  if (on_sale !== undefined) addFilter('pr.is_on_sale = ?', on_sale === 'true');
  if (status) addFilter('pr.status = ?', status);
  
  let mainQuery = `SELECT ${selectClause.replace(/\$\d+/g, (match) => `$${parseInt(match.substring(1)) + (paramIndexForWhere -1)}`)} ${fromAndJoins} ${whereClauses}`;

  const countQuery = `SELECT COUNT(*) ${fromAndJoins} ${whereClauses}`;

  const validSortColumns = { /* ... as before ... */ };
  const sortColumn = validSortColumns[sort_by] || 'pr.price_submission_date';
  const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  mainQuery += ` ORDER BY ${sortColumn} ${sortOrder}`;
  
  const finalQueryParamsForData = [...selectParams, ...queryParamsForCount]; // Combine params for SELECT and WHERE

  mainQuery += ` LIMIT $${paramIndexForWhere + selectParams.length} OFFSET $${paramIndexForWhere + selectParams.length + 1}`;
  finalQueryParamsForData.push(parseInt(limit));
  finalQueryParamsForData.push(parseInt(offset));
  
  try {
    const totalCountResult = await pool.query(countQuery, queryParamsForCount);
    const totalCount = parseInt(totalCountResult.rows[0].count);
    
    const result = await pool.query(mainQuery, finalQueryParamsForData);

    const pricesWithCalc = result.rows.map(row => { /* ... as before ... */ });
    let filteredByCalcPrice = pricesWithCalc;
    if (min_price !== undefined) { /* ... as before ... */ }
    if (max_price !== undefined) { /* ... as before ... */ }

    res.json({ data: filteredByCalcPrice, page_info: { /* ... as before ... */ } });
  } catch (err) { /* ... as before ... */ }
};

const getPriceById = async (req, res) => {
  const { id } = req.params;
  const currentUserId = req.user ? req.user.id : null;
  try {
    const priceEntry = await getFullPriceDetails(id, currentUserId); // Pass currentUserId
    if (!priceEntry) { return res.status(404).json({ error: 'Price entry not found' }); }

    const calculated_price_per_100g_raw = calcPricePer100g({
      regular_price: parseFloat(priceEntry.regular_price),
      sale_price: priceEntry.sale_price ? parseFloat(priceEntry.sale_price) : null,
      unit_for_price: priceEntry.unit_for_price,
      quantity_for_price: parseFloat(priceEntry.quantity_for_price),
      default_weight_per_unit_grams: priceEntry.default_weight_per_unit_grams ? parseFloat(priceEntry.default_weight_per_unit_grams) : null
    });
    const { default_weight_per_unit_grams, ...responseEntry } = priceEntry;
    res.json({ ...responseEntry, calculated_price_per_100g: calculated_price_per_100g_raw !== null ? parseFloat(calculated_price_per_100g_raw.toFixed(2)) : null });
  } catch (err) { /* ... as before ... */ }
};

const createPriceReport = async (req, res) => {
  const { /* ... destructuring as before ... */ 
    product_id, retailer_id, price_submission_date = new Date().toISOString().slice(0, 10),
    price_valid_from, price_valid_to, unit_for_price, quantity_for_price = 1, 
    regular_price, sale_price, is_on_sale = false, 
    source, report_type, status: statusFromBody, notes
  } = req.body;
  const userIdFromToken = req.user.id;
  if (!product_id || !retailer_id || !unit_for_price || !regular_price || !source) { /* ... validation ... */ }
  // ... (rest of your existing validations)

  const finalStatus = statusFromBody !== undefined ? statusFromBody : 'approved';

  try {
    const existingPriceQuery = `SELECT id FROM prices WHERE product_id = $1 AND retailer_id = $2 AND user_id = $3 ORDER BY price_submission_date DESC, created_at DESC LIMIT 1;`;
    const existingPriceResult = await pool.query(existingPriceQuery, [product_id, retailer_id, userIdFromToken]);
    let priceEntryId;
    let statusCode = 201; 
    let successMessage = 'Price report created successfully.';

    if (existingPriceResult.rows.length > 0) {
      priceEntryId = existingPriceResult.rows[0].id;
      statusCode = 200; 
      successMessage = 'Price report updated successfully.';
      const updateFields = []; const queryParamsForUpdate = []; let paramIndexUpdate = 1;
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
        const updateQuery = `UPDATE prices SET ${updateFields.join(', ')} WHERE id = $${paramIndexUpdate} RETURNING id;`;
        await pool.query(updateQuery, queryParamsForUpdate);
      }
    } else {
      const insertQuery = `INSERT INTO prices (product_id, retailer_id, user_id, price_submission_date, price_valid_from, price_valid_to, unit_for_price, quantity_for_price, regular_price, sale_price, is_on_sale, source, report_type, status, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id;`;
      const queryParamsForInsert = [product_id, retailer_id, userIdFromToken, price_submission_date, price_valid_from || null, price_valid_to || null, unit_for_price, quantity_for_price, regular_price, sale_price || null, is_on_sale, source, report_type || null, finalStatus, notes || null];
      const result = await pool.query(insertQuery, queryParamsForInsert);
      priceEntryId = result.rows[0].id;
    }

    const finalPriceEntry = await getFullPriceDetails(priceEntryId, userIdFromToken); 
    if (!finalPriceEntry) { return res.status(500).json({ error: "Failed to retrieve price entry after submission." }); }
    const calculated_price_per_100g_raw = calcPricePer100g({
        regular_price: parseFloat(finalPriceEntry.regular_price), sale_price: finalPriceEntry.sale_price ? parseFloat(finalPriceEntry.sale_price) : null,
        unit_for_price: finalPriceEntry.unit_for_price, quantity_for_price: parseFloat(finalPriceEntry.quantity_for_price),
        default_weight_per_unit_grams: finalPriceEntry.default_weight_per_unit_grams ? parseFloat(finalPriceEntry.default_weight_per_unit_grams) : null
    });
    const { default_weight_per_unit_grams, ...responseEntry } = finalPriceEntry;
    res.status(statusCode).json({ message: successMessage, ...responseEntry, calculated_price_per_100g: calculated_price_per_100g_raw !== null ? parseFloat(calculated_price_per_100g_raw.toFixed(2)) : null });
  } catch (err) { /* ... error handling as before ... */ }
};

const updatePrice = async (req, res) => {
  const { id: priceId } = req.params;
  const updates = req.body;
  const loggedInUser = req.user;
  const currentUserId = loggedInUser.id;

  const allowedUpdates = ['price_valid_from', 'price_valid_to', 'unit_for_price', 'quantity_for_price', 'regular_price', 'sale_price', 'is_on_sale', 'source', 'report_type', 'status', 'notes'];
  const updateFields = [];
  const queryParamsForSet = []; 
  let paramIndex = 1; 
  for (const key in updates) {
    if (allowedUpdates.includes(key)) {
      if (key === 'is_on_sale' && updates[key] === false) { updateFields.push(`${key} = $${paramIndex++}`); queryParamsForSet.push(false); }
      else if (updates[key] !== null && updates[key] !== undefined && updates[key] !== '') { updateFields.push(`${key} = $${paramIndex++}`); queryParamsForSet.push(updates[key]); }
      else if (updates[key] === null || updates[key] === '') { updateFields.push(`${key} = $${paramIndex++}`); queryParamsForSet.push(null); }
    }
  }
  if (updateFields.length === 0) { return res.status(400).json({ error: 'No valid fields provided for update or all fields were empty.' }); }
  const finalQueryParams = [...queryParamsForSet, priceId]; 

  try {
    const originalPriceResult = await pool.query('SELECT user_id, status FROM prices WHERE id = $1', [priceId]);
    if (originalPriceResult.rows.length === 0) { return res.status(404).json({ error: 'Price entry not found.' }); }
    const originalPriceEntry = originalPriceResult.rows[0];
    if (originalPriceEntry.user_id !== loggedInUser.id && loggedInUser.role !== 'admin') { return res.status(403).json({ error: 'Forbidden' }); }

    const updateQuery = `UPDATE prices SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING id;`; 
    const result = await pool.query(updateQuery, finalQueryParams);
    if (result.rows.length === 0) { return res.status(404).json({ error: 'Price entry not found or no update performed.' }); }
    
    const updatedPriceEntry = await getFullPriceDetails(result.rows[0].id, currentUserId);
    const calculated_price_per_100g_raw = calcPricePer100g({
        regular_price: parseFloat(updatedPriceEntry.regular_price), sale_price: updatedPriceEntry.sale_price ? parseFloat(updatedPriceEntry.sale_price) : null,
        unit_for_price: updatedPriceEntry.unit_for_price, quantity_for_price: parseFloat(updatedPriceEntry.quantity_for_price),
        default_weight_per_unit_grams: updatedPriceEntry.default_weight_per_unit_grams ? parseFloat(updatedPriceEntry.default_weight_per_unit_grams) : null
    });
    const { default_weight_per_unit_grams, ...responseEntry } = updatedPriceEntry;
    res.json({ message: 'Price report updated successfully.', ...responseEntry, calculated_price_per_100g: calculated_price_per_100g_raw !== null ? parseFloat(calculated_price_per_100g_raw.toFixed(2)) : null });
  } catch (err) { /* ... error handling as before ... */ }
};

const deletePrice = async (req, res) => { /* ... logic as before ... */ };

// --- Like/Unlike Functions ---
const likePriceReport = async (req, res) => {
  const { priceId } = req.params;
  const userId = req.user.id;
  try {
    const priceCheck = await pool.query('SELECT id FROM prices WHERE id = $1', [priceId]);
    if (priceCheck.rows.length === 0) { return res.status(404).json({ error: 'Price report not found.' }); }
    await pool.query('INSERT INTO price_report_likes (user_id, price_id) VALUES ($1, $2) ON CONFLICT (user_id, price_id) DO NOTHING', [userId, parseInt(priceId)]);
    const likesCountResult = await pool.query('SELECT COUNT(*) FROM price_report_likes WHERE price_id = $1', [priceId]);
    const likesCount = parseInt(likesCountResult.rows[0].count);
    res.status(201).json({ message: 'Price report liked/already liked.', priceId: parseInt(priceId), userId, likesCount, userLiked: true });
  } catch (err) { /* ... error handling as before ... */ }
};

const unlikePriceReport = async (req, res) => {
  const { priceId } = req.params;
  const userId = req.user.id;
  try {
    await pool.query('DELETE FROM price_report_likes WHERE user_id = $1 AND price_id = $2 RETURNING *', [userId, parseInt(priceId)]);
    const likesCountResult = await pool.query('SELECT COUNT(*) FROM price_report_likes WHERE price_id = $1', [priceId]);
    const likesCount = parseInt(likesCountResult.rows[0].count);
    res.status(200).json({ message: 'Price report unliked successfully (or was not liked by user).', priceId: parseInt(priceId), userId, likesCount, userLiked: false });
  } catch (err) { /* ... error handling as before ... */ }
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
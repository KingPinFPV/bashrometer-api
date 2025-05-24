// controllers/pricesController.js
const pool = require('../db'); 
const { calcPricePer100g } = require('../utils/priceCalculator'); 

// אם אתה משתמש במחלקות שגיאה מותאמות אישית, ודא שהן מיובאות כראוי
// const { NotFoundError, BadRequestError, ApplicationError } = require('../utils/errors');

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
  const queryParamsHelper = []; 

  if (currentUserId) {
    query += `,
      EXISTS (SELECT 1 FROM price_report_likes prl_user 
              WHERE prl_user.price_id = pr.id AND prl_user.user_id = $${queryParamsHelper.length + 2}) as current_user_liked
    `; 
    queryParamsHelper.push(currentUserId); 
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
  
  const finalQueryParams = [priceId, ...queryParamsHelper];

  const result = await pool.query(query, finalQueryParams);
  if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
          ...row,
          likes_count: parseInt(row.likes_count, 10) || 0,
      };
  }
  return null;
};

const getAllPrices = async (req, res, next) => {
  const {
    product_id, retailer_id, user_id: userIdQuery,
    status: statusQuery, 
    limit = 10, offset = 0,
    sort_by = 'pr.price_submission_date', order = 'DESC'
  } = req.query;

  const currentRequestingUser = req.user; 
  let queryParams = [];
  let paramIndex = 1;
  let whereClauses = []; 

  if (currentRequestingUser && currentRequestingUser.role === 'admin') {
    if (statusQuery && statusQuery.toLowerCase() !== 'all') { 
      whereClauses.push(`pr.status = $${paramIndex++}`);
      queryParams.push(statusQuery);
    }
  } else {
    whereClauses.push(`pr.status = 'approved'`);
  }

  if (product_id) { whereClauses.push(`pr.product_id = $${paramIndex++}`); queryParams.push(parseInt(product_id)); }
  if (retailer_id) { whereClauses.push(`pr.retailer_id = $${paramIndex++}`); queryParams.push(parseInt(retailer_id)); }
  if (userIdQuery) { whereClauses.push(`pr.user_id = $${paramIndex++}`); queryParams.push(parseInt(userIdQuery)); }
  if (req.query.on_sale !== undefined) { whereClauses.push(`pr.is_on_sale = $${paramIndex++}`); queryParams.push(req.query.on_sale === 'true'); }
  if (req.query.date_from) { whereClauses.push(`pr.price_submission_date >= $${paramIndex++}`); queryParams.push(req.query.date_from); }
  if (req.query.date_to) { whereClauses.push(`pr.price_submission_date <= $${paramIndex++}`); queryParams.push(req.query.date_to); }
      
  const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const totalCountQuery = `SELECT COUNT(DISTINCT pr.id) FROM prices pr ${whereString}`;
  
  let mainQuerySelect = `
    SELECT 
      pr.id, pr.product_id, p.name as product_name, 
      pr.retailer_id, r.name as retailer_name,
      pr.user_id, u.name as reporting_user_name, u.email as reporting_user_email, 
      pr.price_submission_date, pr.price_valid_from, pr.price_valid_to,
      pr.unit_for_price, pr.quantity_for_price, 
      pr.regular_price, pr.sale_price, pr.is_on_sale,
      pr.source, pr.report_type, pr.status, pr.notes,
      pr.created_at, pr.updated_at,
      p.default_weight_per_unit_grams,
      (SELECT COUNT(*) FROM price_report_likes prl WHERE prl.price_id = pr.id) as likes_count
  `;
  
  const queryParamsForMainQuery = [...queryParams]; 
  let currentParamIndexForMain = queryParamsForMainQuery.length + 1;

  if (currentRequestingUser && currentRequestingUser.userId) { // ודא ש-userId קיים בטוקן
    mainQuerySelect += `, 
      EXISTS (SELECT 1 FROM price_report_likes prl_user 
              WHERE prl_user.price_id = pr.id AND prl_user.user_id = $${currentParamIndexForMain++}) as current_user_liked
    `;
    queryParamsForMainQuery.push(currentRequestingUser.userId);
  } else {
    mainQuerySelect += `, FALSE as current_user_liked`;
  }
  
  let mainQuery = `
    ${mainQuerySelect}
    FROM prices pr
    JOIN products p ON pr.product_id = p.id
    JOIN retailers r ON pr.retailer_id = r.id
    LEFT JOIN users u ON pr.user_id = u.id
    ${whereString}
  `;

  const validSortColumns = { 
    'price_submission_date': 'pr.price_submission_date', 
    'created_at': 'pr.created_at',
    'regular_price': 'pr.regular_price', 
  };
  const sortColumn = validSortColumns[sort_by] || 'pr.price_submission_date';
  const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  mainQuery += ` ORDER BY ${sortColumn} ${sortOrder}`;

  mainQuery += ` LIMIT $${currentParamIndexForMain++} OFFSET $${currentParamIndexForMain++}`;
  queryParamsForMainQuery.push(parseInt(limit));
  queryParamsForMainQuery.push(parseInt(offset));
  
  try {
    const totalCountResult = await pool.query(totalCountQuery, queryParams);
    const totalItems = parseInt(totalCountResult.rows[0].count, 10);
    const result = await pool.query(mainQuery, queryParamsForMainQuery);

    const pricesWithCalc = result.rows.map(row => {
      const calculated_price_per_100g = calcPricePer100g({
            regular_price: parseFloat(row.regular_price),
            sale_price: row.sale_price ? parseFloat(row.sale_price) : null,
            unit_for_price: row.unit_for_price,
            quantity_for_price: parseFloat(row.quantity_for_price),
            default_weight_per_unit_grams: row.default_weight_per_unit_grams ? parseFloat(row.default_weight_per_unit_grams) : null
        });
        return {
            ...row,
            likes_count: parseInt(row.likes_count, 10) || 0,
            reporting_user_name: row.reporting_user_name || 'Unknown User',
            calculated_price_per_100g: calculated_price_per_100g !== null ? parseFloat(calculated_price_per_100g.toFixed(2)) : null
        };
    });
    
    res.json({ 
        data: pricesWithCalc, 
        page_info: { 
            total_items: totalItems,
            limit: parseInt(limit),
            offset: parseInt(offset),
            current_page: Math.floor(parseInt(offset) / parseInt(limit)) + 1,
            total_pages: Math.ceil(totalItems / parseInt(limit))
        } 
    });
  } catch (err) {
    console.error("Error in getAllPrices:", err);
    next(err); 
  }
};

const getPriceById = async (req, res, next) => { 
  const { id } = req.params; 
  const currentUserId = req.user ? req.user.id : null;
  try { 
    const numericPriceId = parseInt(id, 10); 
    if (isNaN(numericPriceId)) { 
      return res.status(400).json({ error: 'Invalid price ID format.' }); 
    } 
    const priceEntry = await getFullPriceDetails(numericPriceId, currentUserId); 
    if (!priceEntry) { 
      return res.status(404).json({ error: 'Price entry not found.' }); 
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
    console.error(`Error in getPriceById for id ${id}:`, err); 
    next(err); 
  } 
}; 

const createPriceReport = async (req, res, next) => {
  const { 
    product_id, retailer_id, price_submission_date = new Date().toISOString().slice(0, 10),
    price_valid_from, price_valid_to, unit_for_price, quantity_for_price = 1, 
    regular_price, sale_price, is_on_sale = false, 
    source, report_type, status: statusFromBody, notes
  } = req.body;
  
  if (!req.user || !req.user.id) { 
    console.error("User ID not found in token for createPriceReport");
    return res.status(401).json({ error: "Unauthorized: User ID missing from token." });
  }
  const userIdFromToken = req.user.id; 

  if (!product_id || !retailer_id || !unit_for_price || !regular_price || !source) {
    return res.status(400).json({ error: 'Missing required fields: product_id, retailer_id, unit_for_price, regular_price, source.' });
  }

  let finalStatus = 'pending_approval'; 
  if (req.user.role === 'admin') {
      finalStatus = statusFromBody !== undefined ? statusFromBody : 'approved';
  } else {
      if (statusFromBody && statusFromBody !== 'pending_approval') {
          return res.status(403).json({ error: 'Users can only submit reports as pending approval.' });
      }
  }
  
  try {
    const existingPriceQuery = `
        SELECT id FROM prices 
        WHERE product_id = $1 AND retailer_id = $2 AND user_id = $3 
        ORDER BY price_submission_date DESC, created_at DESC LIMIT 1;
    `;
    const existingPriceResult = await pool.query(existingPriceQuery, [product_id, retailer_id, userIdFromToken]);
    let priceEntryId;
    let statusCode = 201; 
    let successMessage = 'Price report created successfully and is pending approval.';
    if (req.user.role === 'admin' && finalStatus === 'approved') {
        successMessage = 'Price report created and approved successfully.';
    }

    if (existingPriceResult.rows.length > 0 && req.user.role !== 'admin') { 
      priceEntryId = existingPriceResult.rows[0].id;
      statusCode = 200; 
      successMessage = 'Your latest price report for this item has been updated and is pending approval.';
      
      const updateFields = []; 
      const queryParamsForUpdate = []; 
      let paramIndexUpdate = 1;
      const addUpdateField = (field, value, defaultValue = null) => {
          if (value !== undefined) {
              updateFields.push(`${field} = $${paramIndexUpdate++}`);
              queryParamsForUpdate.push(value === '' ? defaultValue : value);
          }
      };
      addUpdateField('price_submission_date', price_submission_date);
      addUpdateField('price_valid_from', price_valid_from, null);
      addUpdateField('unit_for_price', unit_for_price);
      addUpdateField('quantity_for_price', quantity_for_price);
      addUpdateField('regular_price', regular_price);
      addUpdateField('sale_price', sale_price, null);
      addUpdateField('is_on_sale', is_on_sale);
      addUpdateField('source', source);
      addUpdateField('notes', notes, null);
      updateFields.push(`status = 'pending_approval'`); 
      
      if (updateFields.length > 1) { 
          updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
          queryParamsForUpdate.push(priceEntryId);
          const updateQuery = `UPDATE prices SET ${updateFields.join(', ')} WHERE id = $${paramIndexUpdate} RETURNING id;`;
          await pool.query(updateQuery, queryParamsForUpdate);
      } else {
           successMessage = 'No fields to update on existing report.';
      }
    } else { 
      const insertQuery = `
        INSERT INTO prices 
          (product_id, retailer_id, user_id, price_submission_date, price_valid_from, price_valid_to, 
           unit_for_price, quantity_for_price, regular_price, sale_price, is_on_sale, 
           source, report_type, status, notes) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
        RETURNING id;
      `;
      const queryParamsForInsert = [
          product_id, retailer_id, userIdFromToken, price_submission_date, price_valid_from || null, 
          price_valid_to || null, unit_for_price, quantity_for_price, regular_price, sale_price || null, 
          is_on_sale, source, report_type || (req.user.role === 'admin' ? 'manual' : 'community'), 
          finalStatus, notes || null
      ];
      const result = await pool.query(insertQuery, queryParamsForInsert);
      priceEntryId = result.rows[0].id;
    }

    const finalPriceEntry = await getFullPriceDetails(priceEntryId, userIdFromToken); 
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
        id: priceEntryId, 
        calculated_price_per_100g: calculated_price_per_100g_raw !== null ? parseFloat(calculated_price_per_100g_raw.toFixed(2)) : null 
    });
  } catch (err) {
    console.error("Error in createPriceReport:", err);
    next(err);
  }
};

const updatePrice = async (req, res, next) => { 
  const { id: priceIdParam } = req.params; 
  const updates = req.body; 
    
  if (!req.user || !req.user.id || !req.user.role) { 
    console.error("User info not found in token for updatePrice"); 
    return res.status(401).json({ error: "Unauthorized: User info missing from token." }); 
  } 
  const loggedInUser = req.user; 

  try { 
    const priceId = parseInt(priceIdParam, 10); 
    if (isNaN(priceId)) { 
      return res.status(400).json({ error: 'Invalid price ID format.' }); 
    } 

    const originalPriceResult = await pool.query('SELECT user_id, status FROM prices WHERE id = $1', [priceId]); 
    if (originalPriceResult.rows.length === 0) { 
      return res.status(404).json({ error: 'Price entry not found.' }); 
    } 
    const originalPriceEntry = originalPriceResult.rows[0]; 

    if (originalPriceEntry.user_id !== loggedInUser.id && loggedInUser.role !== 'admin') { 
      return res.status(403).json({ error: 'Forbidden: You do not have permission to update this price report.' }); 
    } 

    const allowedUpdatesForUser = [
        'price_valid_from', 'price_valid_to', 'unit_for_price', 'quantity_for_price', 
        'regular_price', 'sale_price', 'is_on_sale', 'notes'
    ];
    const allowedUpdatesForAdmin = [
        ...allowedUpdatesForUser, 'product_id', 'retailer_id', 'user_id', 
        'price_submission_date', 'source', 'report_type', 'status'
    ];
    
    const allowedUpdates = loggedInUser.role === 'admin' ? allowedUpdatesForAdmin : allowedUpdatesForUser;

    const updateFields = []; 
    const queryParamsForSet = [];  
    let paramIndex = 1;  

    for (const key in updates) { 
      if (allowedUpdates.includes(key)) { 
        if (updates[key] !== undefined) {
            updateFields.push(`${key} = $${paramIndex++}`); 
            queryParamsForSet.push(updates[key]); 
        } 
      } 
    } 

    if (loggedInUser.role !== 'admin') {
        const statusUpdateIndex = updateFields.findIndex(f => f.startsWith('status ='));
        if (statusUpdateIndex !== -1) { 
            if (queryParamsForSet[statusUpdateIndex] !== 'pending_approval') {
                queryParamsForSet[statusUpdateIndex] = 'pending_approval';
            }
        } else { 
            updateFields.push(`status = $${paramIndex++}`);
            queryParamsForSet.push('pending_approval');
        }
    }

    if (updateFields.length === 0) { 
      return res.status(400).json({ error: 'No valid fields provided for update.' }); 
    } 
      
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`); 
    const finalQueryParams = [...queryParamsForSet, priceId];  

    const updateQuery = `UPDATE prices SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING id;`;  
    const result = await pool.query(updateQuery, finalQueryParams); 

    if (result.rows.length === 0) { 
      return res.status(404).json({ error: 'Price entry not found after update attempt or no update performed.' }); 
    } 
      
    const updatedPriceEntry = await getFullPriceDetails(result.rows[0].id, loggedInUser.id); 
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
        id: result.rows[0].id, 
        calculated_price_per_100g: calculated_price_per_100g_raw !== null ? parseFloat(calculated_price_per_100g_raw.toFixed(2)) : null  
    }); 
  } catch (err) { 
    console.error(`Error in updatePrice for id ${priceIdParam}:`, err); 
    next(err); 
  } 
}; 

const deletePrice = async (req, res, next) => { 
  const { id: priceIdParam } = req.params; 

  if (!req.user || !req.user.id || !req.user.role) { 
    console.error("User info not found in token for deletePrice"); 
    return res.status(401).json({ error: "Unauthorized: User info missing from token." }); 
  } 
  const loggedInUser = req.user; 

  try { 
    const priceId = parseInt(priceIdParam, 10); 
    if (isNaN(priceId)) { 
        return res.status(400).json({ error: 'Invalid price ID format.' }); 
    } 

    const priceCheck = await pool.query('SELECT user_id FROM prices WHERE id = $1', [priceId]); 
    if (priceCheck.rows.length === 0) { 
      return res.status(404).json({ error: 'Price report not found.' }); 
    } 

    if (priceCheck.rows[0].user_id !== loggedInUser.id && loggedInUser.role !== 'admin') { 
      return res.status(403).json({ error: 'Forbidden: You do not have permission to delete this price report.'}); 
    } 

    await pool.query('DELETE FROM prices WHERE id = $1', [priceId]); 
    res.status(204).send();  
  } catch (err) { 
    console.error(`Error in deletePrice for id ${priceIdParam}:`, err); 
    next(err); 
  } 
}; 

const likePriceReport = async (req, res, next) => { 
  const { priceId: priceIdParam } = req.params; 
    
  if (!req.user || !req.user.id) { 
    console.error("User ID not found in token for likePriceReport"); 
    return res.status(401).json({ error: "Unauthorized: User ID missing from token." }); 
  } 
  const userId = req.user.id; 

  try { 
    const priceId = parseInt(priceIdParam, 10); 
    if (isNaN(priceId)) { 
      return res.status(400).json({ error: 'Invalid price ID format.' }); 
    } 

    const priceCheck = await pool.query('SELECT id FROM prices WHERE id = $1', [priceId]); 
    if (priceCheck.rows.length === 0) { 
      return res.status(404).json({ error: 'Price report not found.' }); 
    } 

    await pool.query( 
      'INSERT INTO price_report_likes (user_id, price_id) VALUES ($1, $2) ON CONFLICT (user_id, price_id) DO NOTHING', 
      [userId, priceId] 
    ); 

    const likesCountResult = await pool.query('SELECT COUNT(*) FROM price_report_likes WHERE price_id = $1', [priceId]); 
    const likesCount = parseInt(likesCountResult.rows[0].count, 10); 

    res.status(200).json({  
      message: 'Price report liked or already liked.', 
      priceId: priceId, 
      userId, 
      likesCount, 
      userLiked: true  
    }); 
  } catch (err) { 
    console.error(`Error in likePriceReport for priceId ${priceIdParam}:`, err); 
    next(err);  
  } 
}; 

const unlikePriceReport = async (req, res, next) => { 
  const { priceId: priceIdParam } = req.params; 

  if (!req.user || !req.user.id) { 
    console.error("User ID not found in token for unlikePriceReport"); 
    return res.status(401).json({ error: "Unauthorized: User ID missing from token." }); 
  } 
  const userId = req.user.id; 

  try { 
    const priceId = parseInt(priceIdParam, 10); 
    if (isNaN(priceId)) { 
      return res.status(400).json({ error: 'Invalid price ID format.' }); 
    } 

    const priceCheck = await pool.query('SELECT id FROM prices WHERE id = $1', [priceId]); 
    if (priceCheck.rows.length === 0) { 
        return res.status(404).json({ error: 'Price report not found.' }); 
    } 

    const deleteResult = await pool.query( 
      'DELETE FROM price_report_likes WHERE user_id = $1 AND price_id = $2', 
      [userId, priceId] 
    ); 

    const likesCountResult = await pool.query('SELECT COUNT(*) FROM price_report_likes WHERE price_id = $1', [priceId]); 
    const likesCount = parseInt(likesCountResult.rows[0].count, 10); 

    const message = deleteResult.rowCount > 0 ? 'Price report unliked successfully.' : 'User had not liked this price report (no like to remove).'; 
      
    res.status(200).json({ 
      message: message, 
      priceId: priceId, 
      userId, 
      likesCount, 
      userLiked: false  
    }); 
  } catch (err) { 
    console.error(`Error in unlikePriceReport for priceId ${priceIdParam}:`, err); 
    next(err);  
  } 
}; 

// --- פונקציה חדשה לעדכון סטטוס של דיווח מחיר (אדמין בלבד) ---
const updatePriceReportStatus = async (req, res, next) => {
  const { priceId: priceIdParam } = req.params;
  const { status } = req.body;

  const numericPriceId = parseInt(priceIdParam, 10);
  if (isNaN(numericPriceId)) {
    return res.status(400).json({ error: 'Invalid price ID format.' });
  }

  const allowedStatuses = ['pending_approval', 'approved', 'rejected', 'expired', 'edited'];
  if (!status || !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status provided. Must be one of: ${allowedStatuses.join(', ')}` });
  }

  try {
    const result = await pool.query(
      'UPDATE prices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, numericPriceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Price report not found for status update.' });
    }
    
    const updatedReport = await getFullPriceDetails(numericPriceId, req.user ? req.user.id : null);
    res.status(200).json(updatedReport || result.rows[0]);

  } catch (err) {
    console.error(`Error updating status for price report ${priceIdParam}:`, err.message);
    next(err);
  }
};

module.exports = { 
  getAllPrices, 
  getPriceById, 
  createPriceReport, 
  updatePrice, 
  deletePrice, 
  likePriceReport, 
  unlikePriceReport,
  updatePriceReportStatus 
};
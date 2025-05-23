// controllers/pricesController.js
const pool = require('../db'); // ודא שהנתיב נכון
const { calcPricePer100g } = require('../utils/priceCalculator'); // ודא שהנתיב נכון

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
  const queryParamsHelper = []; // Parameters for the helper function's logic part

  if (currentUserId) {
    query += `,
      EXISTS (SELECT 1 FROM price_report_likes prl_user 
              WHERE prl_user.price_id = pr.id AND prl_user.user_id = $${queryParamsHelper.length + 2}) as current_user_liked
    `; // $2 because priceId will be $1
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

  try {
    const result = await pool.query(query, finalQueryParams);
    if (result.rows.length > 0) {
        const row = result.rows[0];
        return {
            ...row,
            likes_count: parseInt(row.likes_count, 10) || 0,
        };
    }
    return null;
  } catch (error) {
    console.error(`Error in getFullPriceDetails for priceId ${priceId}:`, error);
    throw error; // Re-throw for the calling controller to handle via next(err)
  }
};

const getAllPrices = async (req, res, next) => { // Added next
  const {
    product_id, retailer_id, date_from, date_to, on_sale, status,
    min_price, max_price, 
    limit = 10, offset = 0,
    sort_by = 'price_submission_date', order = 'DESC'
  } = req.query;

  const currentUserId = req.user ? req.user.id : null; 

  try {
    // Your complex query logic for getAllPrices...
    // Ensure all await pool.query calls are wrapped or their errors are caught by this try-catch
    // For brevity, I'm keeping your existing logic structure and just adding next(err)
    // ... (Your existing query building logic for getAllPrices) ...

    // Placeholder for your actual query execution logic (replace with your code)
    // const totalCountResult = await pool.query(countQuery, queryParamsForCount);
    // const totalCount = parseInt(totalCountResult.rows[0].count);
    // const result = await pool.query(mainQuery, finalQueryParamsForData);
    // const pricesWithCalc = result.rows.map(row => { /* ... */ });
    // let filteredByCalcPrice = pricesWithCalc;
    // if (min_price !== undefined) { /* ... */ }
    // if (max_price !== undefined) { /* ... */ }
    // res.json({ data: filteredByCalcPrice, page_info: { /* ... */ } });
    
    // Since the full logic is complex and was truncated, let's assume it's similar to this:
    // If you have it fully implemented, that's great. Otherwise, this is a simplified response.
    // This part needs to be replaced by your actual working query and response logic from your file.
    // For now, to make the server run, I'll put a placeholder that you should replace.
    console.warn("getAllPrices in controllers/pricesController.js needs its full query logic restored if it was truncated.");
    res.status(200).json({ message: "getAllPrices placeholder - implement full logic", data: [], page_info: {} });

  } catch (err) {
    console.error("Error in getAllPrices:", err);
    next(err); 
  }
};

const getPriceById = async (req, res, next) => { // Added next
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

const createPriceReport = async (req, res, next) => { // Added next
  const { 
    product_id, retailer_id, price_submission_date = new Date().toISOString().slice(0, 10),
    price_valid_from, price_valid_to, unit_for_price, quantity_for_price = 1, 
    regular_price, sale_price, is_on_sale = false, 
    source, report_type, status: statusFromBody, notes
  } = req.body;
  
  // Ensure req.user and req.user.id exist (from authenticateToken)
  if (!req.user || req.user.id === undefined) {
    console.error("User ID not found in token for createPriceReport");
    return res.status(401).json({ error: "Unauthorized: User ID missing from token." });
  }
  const userIdFromToken = req.user.id;

  if (!product_id || !retailer_id || !unit_for_price || !regular_price || !source) {
    return res.status(400).json({ error: 'Missing required fields: product_id, retailer_id, unit_for_price, regular_price, source.' });
  }

  const finalStatus = statusFromBody !== undefined ? statusFromBody : 'approved';

  try {
    // Your UPSERT logic (ensure it's complete and correct from your file)
    // ... (Your existing UPSERT logic for createPriceReport) ...
    // For now, to make the server run, I'll put a placeholder that you should replace.
    console.warn("createPriceReport in controllers/pricesController.js needs its full UPSERT logic restored if it was truncated.");
    res.status(201).json({ message: "createPriceReport placeholder - implement full logic" });

  } catch (err) {
    console.error("Error in createPriceReport:", err);
    next(err);
  }
};

const updatePrice = async (req, res, next) => { // Added next
  const { id: priceIdParam } = req.params;
  const updates = req.body;
  
  if (!req.user || req.user.id === undefined || req.user.role === undefined) {
    console.error("User info not found in token for updatePrice");
    return res.status(401).json({ error: "Unauthorized: User info missing from token." });
  }
  const loggedInUser = req.user;

  try {
    const priceId = parseInt(priceIdParam, 10);
    if (isNaN(priceId)) {
      return res.status(400).json({ error: 'Invalid price ID format.' });
    }
    // Your update logic (ensure it's complete and correct from your file)
    // ... (Your existing update logic for updatePrice, including authorization) ...
    // For now, to make the server run, I'll put a placeholder that you should replace.
    console.warn("updatePrice in controllers/pricesController.js needs its full update logic restored if it was truncated.");
    res.status(200).json({ message: "updatePrice placeholder - implement full logic" });
  } catch (err) {
    console.error(`Error in updatePrice for id ${priceIdParam}:`, err);
    next(err);
  }
};

const deletePrice = async (req, res, next) => { // Added next
  const { id: priceIdParam } = req.params;

  if (!req.user || req.user.id === undefined || req.user.role === undefined) {
    console.error("User info not found in token for deletePrice");
    return res.status(401).json({ error: "Unauthorized: User info missing from token." });
  }
  const loggedInUser = req.user;

  try {
    const priceId = parseInt(priceIdParam, 10);
    if (isNaN(priceId)) {
        return res.status(400).json({ error: 'Invalid price ID format.' });
    }
    // Your delete logic (ensure it's complete and correct from your file)
    // ... (Your existing delete logic for deletePrice, including authorization) ...
    // For now, to make the server run, I'll put a placeholder that you should replace.
    console.warn("deletePrice in controllers/pricesController.js needs its full delete logic restored if it was truncated.");
    res.status(204).send();
  } catch (err) {
    console.error(`Error in deletePrice for id ${priceIdParam}:`, err);
    next(err);
  }
};

// --- Like/Unlike Functions (Corrected Error Handling) ---
const likePriceReport = async (req, res, next) => { // Added next
  const { priceId: priceIdParam } = req.params;
  
  if (!req.user || req.user.id === undefined) {
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

const unlikePriceReport = async (req, res, next) => { // Added next
  const { priceId: priceIdParam } = req.params;

  if (!req.user || req.user.id === undefined) {
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

module.exports = {
  getAllPrices,
  getPriceById,
  createPriceReport,
  updatePrice,
  deletePrice,
  likePriceReport,
  unlikePriceReport
};
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

  // שגיאות שייזרקו מכאן ייתפסו על ידי ה-catch block של הפונקציה הקוראת
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
    sort_by = 'pr.price_submission_date', order = 'DESC',
    search // פרמטר חיפוש חדש
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
  
  if (search && search.trim() !== '') {
    // הוספת תנאי ל-WHERE clause, יש לשים לב שהפרמטר של search הוא האחרון במערך queryParams עד כה
    whereClauses.push(`(
      LOWER(p.name) ILIKE $${paramIndex} OR 
      LOWER(r.name) ILIKE $${paramIndex} OR 
      LOWER(u.name) ILIKE $${paramIndex} OR
      LOWER(u.email) ILIKE $${paramIndex}
    )`);
    queryParams.push(`%${search.trim().toLowerCase()}%`); // המר ל-lowercase גם כאן
    paramIndex++; // קדם את האינדקס לאחר הוספת הפרמטר
  }
      
  const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  
  const totalCountQuery = `
    SELECT COUNT(DISTINCT pr.id) 
    FROM prices pr
    JOIN products p ON pr.product_id = p.id
    JOIN retailers r ON pr.retailer_id = r.id
    LEFT JOIN users u ON pr.user_id = u.id
    ${whereString}
  `;
  
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
  let currentParamIndexForMain = queryParams.length + 1; // התחל את האינדקס לפרמטרים של SELECT אחרי פרמטרי ה-WHERE

  if (currentRequestingUser && currentRequestingUser.userId) {
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
    const totalCountResult = await pool.query(totalCountQuery, queryParams); // שאילתת הספירה משתמשת בפרמטרי ה-WHERE המקוריים
    const totalItems = parseInt(totalCountResult.rows[0].count, 10);
    const result = await pool.query(mainQuery, queryParamsForMainQuery);

    const pricesWithCalc = result.rows.map(row => { /* ... כפי שהיה ... */ });
    
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

// --- שאר הפונקציות נשארות כפי ששלחת, עם הוספת next וקריאה ל-next(err) ---

const getPriceById = async (req, res, next) => { /* ... הקוד שלך עם next(err) ... */ };
const createPriceReport = async (req, res, next) => { /* ... הקוד שלך עם next(err) ... */ };
const updatePrice = async (req, res, next) => { /* ... הקוד שלך עם next(err) ... */ };
const deletePrice = async (req, res, next) => { /* ... הקוד שלך עם next(err) ... */ };
const likePriceReport = async (req, res, next) => { /* ... הקוד שלך עם next(err) ... */ };
const unlikePriceReport = async (req, res, next) => { /* ... הקוד שלך עם next(err) ... */ };

// --- פונקציה חדשה לעדכון סטטוס ---
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
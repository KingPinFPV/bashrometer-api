// controllers/productsController.js
const pool = require('../db');
const { calcPricePer100g } = require('../utils/priceCalculator');

// Helper function to fetch a single price entry with all necessary details
// נראה שהפונקציה הזו אינה בשימוש ישיר על ידי הפונקציות המיוצאות למטה,
// אבל אם כן, שים לב שגם היא צריכה טיפול בשגיאות אם היא קוראת ל-DB.
// כרגע, היא זורקת את השגיאה חזרה, מה שיתפס על ידי ה-catch של הפונקציה הקוראת.
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

  // שגיאות מכאן יזרקו ויתפסו בפונקציה הקוראת
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


const getAllProducts = async (req, res, next) => { // הוספת next
  const { 
    limit = 10, offset = 0, category, brand, kosher_level, 
    animal_type, name_like, sort_by = 'p.name', order = 'ASC'
  } = req.query;
  
  const queryParams = [];
  let paramIndex = 1; // נשתמש בזה כדי לבנות את הפרמטרים לשאילתה הראשית
  let whereClauses = " WHERE p.is_active = TRUE ";

  if (category) { whereClauses += ` AND LOWER(p.category) LIKE LOWER($${paramIndex++})`; queryParams.push(`%${category}%`); }
  if (brand) { whereClauses += ` AND LOWER(p.brand) LIKE LOWER($${paramIndex++})`; queryParams.push(`%${brand}%`); }
  if (kosher_level) { whereClauses += ` AND p.kosher_level = $${paramIndex++}`; queryParams.push(kosher_level); }
  if (animal_type) { whereClauses += ` AND LOWER(p.animal_type) LIKE LOWER($${paramIndex++})`; queryParams.push(`%${animal_type}%`); }
  if (name_like) { whereClauses += ` AND LOWER(p.name) LIKE LOWER($${paramIndex++})`; queryParams.push(`%${name_like}%`); }

  // שאילתת הספירה צריכה להשתמש באותם פרמטרים של ה-WHERE clause
  const countQuery = `SELECT COUNT(DISTINCT p.id) FROM products p ${whereClauses}`;
  
  let mainQuery = `
    SELECT 
      p.id, p.name, p.brand, p.short_description, p.image_url, p.category, 
      p.unit_of_measure, p.is_active, p.origin_country, p.kosher_level, p.animal_type,
      p.cut_type, p.description, p.default_weight_per_unit_grams,
      (
        SELECT ROUND(MIN(
            CASE 
                WHEN pr.unit_for_price = 'kg' THEN (COALESCE(pr.sale_price, pr.regular_price) / pr.quantity_for_price) / 10
                WHEN pr.unit_for_price = '100g' THEN (COALESCE(pr.sale_price, pr.regular_price) / pr.quantity_for_price)
                WHEN pr.unit_for_price = 'g' THEN (COALESCE(pr.sale_price, pr.regular_price) / pr.quantity_for_price) * 100
                WHEN pr.unit_for_price IN ('unit', 'package') AND p.default_weight_per_unit_grams > 0 AND p.default_weight_per_unit_grams IS NOT NULL THEN 
                     (COALESCE(pr.sale_price, pr.regular_price) / (pr.quantity_for_price * p.default_weight_per_unit_grams / 100))
                ELSE NULL 
            END
        ), 2)
        FROM prices pr 
        WHERE pr.product_id = p.id 
          AND pr.status = 'approved' 
          AND (pr.price_valid_to IS NULL OR pr.price_valid_to >= CURRENT_DATE)
      ) as min_price_per_100g
    FROM products p
    ${whereClauses}
  `;

  const validSortColumns = {
    'name': 'p.name',
    'brand': 'p.brand',
    'category': 'p.category',
    // הוסף עמודות מיון נוספות אם יש לך
  };
  const sortColumn = validSortColumns[sort_by] || 'p.name';
  const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  mainQuery += ` ORDER BY ${sortColumn} ${sortOrder}`;

  const finalQueryParamsForData = [...queryParams]; // שכפל את מערך הפרמטרים
  mainQuery += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  finalQueryParamsForData.push(parseInt(limit));
  finalQueryParamsForData.push(parseInt(offset));

  try {
    const countResult = await pool.query(countQuery, queryParams); // שאילתת הספירה משתמשת ב-queryParams המקוריים
    const totalItems = parseInt(countResult.rows[0].count, 10);
    
    const result = await pool.query(mainQuery, finalQueryParamsForData);

    res.json({
      data: result.rows.map(p => ({...p, min_price_per_100g: p.min_price_per_100g ? parseFloat(p.min_price_per_100g) : null })),
      page_info: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total_items: totalItems,
        current_page_count: result.rows.length,
        total_pages: Math.ceil(totalItems / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error in getAllProducts:', err.message);
    next(err); // העבר ל-Global Error Handler
  }
};

const getProductById = async (req, res, next) => { // הוספת next
  const { id } = req.params;

  const numericProductId = parseInt(id, 10);
  if (isNaN(numericProductId)) {
    return res.status(400).json({ error: 'Invalid product ID format. Must be an integer.' });
  }

  const currentUserId = req.user ? req.user.id : null;

  try {
    const productQuery = `
      SELECT 
        p.id, p.name, p.brand, p.origin_country, p.kosher_level, p.animal_type, 
        p.cut_type, p.description, p.category, p.unit_of_measure, 
        p.default_weight_per_unit_grams, p.image_url, p.short_description, p.is_active
      FROM products p
      WHERE p.id = $1 AND p.is_active = TRUE 
    `;
    const productResult = await pool.query(productQuery, [numericProductId]);

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const product = productResult.rows[0];

    const pricesQuery = `
      SELECT 
        r.id as retailer_id, r.name as retailer_name, 
        pr.id as price_id, pr.regular_price, pr.sale_price, pr.unit_for_price, 
        pr.quantity_for_price, pr.is_on_sale, pr.price_submission_date,
        pr.price_valid_to, pr.notes as price_notes,
        (SELECT COUNT(*) FROM price_report_likes prl WHERE prl.price_id = pr.id) as likes_count,
        EXISTS (SELECT 1 FROM price_report_likes prl_user 
                WHERE prl_user.price_id = pr.id AND prl_user.user_id = $2) as current_user_liked
      FROM prices pr
      JOIN retailers r ON pr.retailer_id = r.id
      JOIN products p_for_prices ON pr.product_id = p_for_prices.id -- JOIN לטבלת products
      WHERE pr.product_id = $1 AND pr.status = 'approved' AND r.is_active = TRUE
      ORDER BY (
          CASE 
              WHEN pr.unit_for_price = 'kg' THEN (COALESCE(pr.sale_price, pr.regular_price) / pr.quantity_for_price) / 10
              WHEN pr.unit_for_price = '100g' THEN (COALESCE(pr.sale_price, pr.regular_price) / pr.quantity_for_price)
              WHEN pr.unit_for_price = 'g' THEN (COALESCE(pr.sale_price, pr.regular_price) / pr.quantity_for_price) * 100
              WHEN pr.unit_for_price IN ('unit', 'package') AND p_for_prices.default_weight_per_unit_grams > 0 AND p_for_prices.default_weight_per_unit_grams IS NOT NULL
                   THEN (COALESCE(pr.sale_price, pr.regular_price) / (pr.quantity_for_price * p_for_prices.default_weight_per_unit_grams / 100))
              ELSE NULL 
          END
      ) ASC, 
      pr.price_submission_date DESC
      LIMIT 10; 
    `;
    const pricesResult = await pool.query(pricesQuery, [numericProductId, currentUserId]);

    const price_examples = pricesResult.rows.map(priceEntry => {
      const calculated_price_per_100g_raw = calcPricePer100g({
        regular_price: parseFloat(priceEntry.regular_price),
        sale_price: priceEntry.sale_price ? parseFloat(priceEntry.sale_price) : null,
        unit_for_price: priceEntry.unit_for_price,
        quantity_for_price: parseFloat(priceEntry.quantity_for_price),
        default_weight_per_unit_grams: product.default_weight_per_unit_grams ? parseFloat(product.default_weight_per_unit_grams) : null
      });
      return {
        price_id: priceEntry.price_id,
        retailer_id: priceEntry.retailer_id,
        retailer: priceEntry.retailer_name,
        regular_price: parseFloat(priceEntry.regular_price),
        sale_price: priceEntry.sale_price ? parseFloat(priceEntry.sale_price) : null,
        is_on_sale: priceEntry.is_on_sale,
        unit_for_price: priceEntry.unit_for_price,
        quantity_for_price: parseFloat(priceEntry.quantity_for_price),
        submission_date: priceEntry.price_submission_date,
        valid_to: priceEntry.price_valid_to,
        notes: priceEntry.price_notes,
        likes_count: parseInt(priceEntry.likes_count, 10) || 0,
        current_user_liked: priceEntry.current_user_liked,
        calculated_price_per_100g: calculated_price_per_100g_raw !== null ? parseFloat(calculated_price_per_100g_raw.toFixed(2)) : null
      };
    });

    const response = {
      ...product,
      default_weight_per_unit_grams: product.default_weight_per_unit_grams ? parseFloat(product.default_weight_per_unit_grams) : null,
      price_examples: price_examples
    };
    res.json(response);
  } catch (err) {
    console.error(`Error in getProductById (id: ${id}):`, err.message); // מספיק הודעת שגיאה
    next(err); // העבר ל-Global Error Handler
  }
};

module.exports = {
  getAllProducts,
  getProductById,
};
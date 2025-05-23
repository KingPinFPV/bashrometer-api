// controllers/productsController.js
const pool = require('../db');
const { calcPricePer100g } = require('../utils/priceCalculator');
// אם תחליט להשתמש במחלקות שגיאה מותאמות, תצטרך לייבא אותן:
// const { NotFoundError, BadRequestError, ApplicationError } = require('../utils/errors');

const getAllProducts = async (req, res, next) => {
  const { 
    limit = 10, offset = 0, category, brand, kosher_level, 
    animal_type, name_like, sort_by = 'p.name', order = 'ASC'
  } = req.query;
  
  const queryParams = [];
  let paramIndex = 1; 
  let whereClauses = " WHERE p.is_active = TRUE "; 

  if (category) { whereClauses += ` AND LOWER(p.category) LIKE LOWER($${paramIndex++})`; queryParams.push(`%${category}%`); }
  if (brand) { whereClauses += ` AND LOWER(p.brand) LIKE LOWER($${paramIndex++})`; queryParams.push(`%${brand}%`); }
  if (kosher_level) { whereClauses += ` AND p.kosher_level = $${paramIndex++}`; queryParams.push(kosher_level); }
  if (animal_type) { whereClauses += ` AND LOWER(p.animal_type) LIKE LOWER($${paramIndex++})`; queryParams.push(`%${animal_type}%`); }
  if (name_like) { whereClauses += ` AND LOWER(p.name) LIKE LOWER($${paramIndex++})`; queryParams.push(`%${name_like}%`); }

  const countQueryParams = [...queryParams]; 
  const countQuery = `SELECT COUNT(DISTINCT p.id) FROM products p ${whereClauses.replace(/\$\d+/g, (match, i) => `$${countQueryParams.indexOf(queryParams[parseInt(match.substring(1))-1]) + 1}`)}`;
  
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
    'name': 'p.name', 'brand': 'p.brand', 'category': 'p.category',
  };
  const sortColumn = validSortColumns[sort_by] || 'p.name';
  const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  mainQuery += ` ORDER BY ${sortColumn} ${sortOrder}`;

  const finalQueryParamsForData = [...queryParams]; 
  mainQuery += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  finalQueryParamsForData.push(parseInt(limit));
  finalQueryParamsForData.push(parseInt(offset));

  try {
    const countResult = await pool.query(countQuery, countQueryParams); 
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
    next(err); 
  }
};

const getProductById = async (req, res, next) => { 
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
      WHERE p.id = $1 -- Removed AND p.is_active = TRUE to allow admin to see inactive products by ID
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
      JOIN products p_for_prices ON pr.product_id = p_for_prices.id
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
        price_id: priceEntry.price_id, retailer_id: priceEntry.retailer_id, retailer: priceEntry.retailer_name,
        regular_price: parseFloat(priceEntry.regular_price), sale_price: priceEntry.sale_price ? parseFloat(priceEntry.sale_price) : null,
        is_on_sale: priceEntry.is_on_sale, unit_for_price: priceEntry.unit_for_price,
        quantity_for_price: parseFloat(priceEntry.quantity_for_price), submission_date: priceEntry.price_submission_date,
        valid_to: priceEntry.price_valid_to, notes: priceEntry.price_notes,
        likes_count: parseInt(priceEntry.likes_count, 10) || 0, current_user_liked: priceEntry.current_user_liked,
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
    console.error(`Error in getProductById (id: ${id}):`, err.message);
    next(err); 
  }
};

// --- CRUD Functions for Products (Admin Only) ---

const createProduct = async (req, res, next) => {
  // הרשאות אדמין ייבדקו על ידי middleware ב-router
  const { 
    name, brand, origin_country, kosher_level, animal_type, cut_type, 
    description, category, unit_of_measure = 'kg', // ברירת מחדל אם לא נשלח
    default_weight_per_unit_grams, image_url, short_description, is_active = true 
  } = req.body;

  if (!name || !unit_of_measure) {
    return res.status(400).json({ error: 'Product name and unit_of_measure are required.' });
  }

  try {
    const newProduct = await pool.query(
      `INSERT INTO products 
        (name, brand, origin_country, kosher_level, animal_type, cut_type, 
         description, category, unit_of_measure, default_weight_per_unit_grams, 
         image_url, short_description, is_active) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
       RETURNING *`,
      [
        name, brand, origin_country, kosher_level, animal_type, cut_type, 
        description, category, unit_of_measure, default_weight_per_unit_grams, 
        image_url, short_description, is_active
      ]
    );
    res.status(201).json(newProduct.rows[0]);
  } catch (err) {
    console.error('Error in createProduct:', err.message);
    next(err);
  }
};

const updateProduct = async (req, res, next) => {
  const { id } = req.params;
  const numericProductId = parseInt(id, 10);
  if (isNaN(numericProductId)) {
    return res.status(400).json({ error: 'Invalid product ID format.' });
  }

  const { 
    name, brand, origin_country, kosher_level, animal_type, cut_type, 
    description, category, unit_of_measure, default_weight_per_unit_grams, 
    image_url, short_description, is_active 
  } = req.body;

  // הרכב שאילתת עדכון דינמית כדי לעדכן רק שדות שנשלחו
  const fields = [];
  const values = [];
  let paramCount = 1;

  if (name !== undefined) { fields.push(`name = $${paramCount++}`); values.push(name); }
  if (brand !== undefined) { fields.push(`brand = $${paramCount++}`); values.push(brand); }
  if (origin_country !== undefined) { fields.push(`origin_country = $${paramCount++}`); values.push(origin_country); }
  if (kosher_level !== undefined) { fields.push(`kosher_level = $${paramCount++}`); values.push(kosher_level); }
  if (animal_type !== undefined) { fields.push(`animal_type = $${paramCount++}`); values.push(animal_type); }
  if (cut_type !== undefined) { fields.push(`cut_type = $${paramCount++}`); values.push(cut_type); }
  if (description !== undefined) { fields.push(`description = $${paramCount++}`); values.push(description); }
  if (category !== undefined) { fields.push(`category = $${paramCount++}`); values.push(category); }
  if (unit_of_measure !== undefined) { fields.push(`unit_of_measure = $${paramCount++}`); values.push(unit_of_measure); }
  if (default_weight_per_unit_grams !== undefined) { fields.push(`default_weight_per_unit_grams = $${paramCount++}`); values.push(default_weight_per_unit_grams); }
  if (image_url !== undefined) { fields.push(`image_url = $${paramCount++}`); values.push(image_url); }
  if (short_description !== undefined) { fields.push(`short_description = $${paramCount++}`); values.push(short_description); }
  if (is_active !== undefined) { fields.push(`is_active = $${paramCount++}`); values.push(is_active); }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields provided for update.' });
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`); // עדכן תמיד את updated_at
  values.push(numericProductId); // ה-ID של המוצר לעדכון הוא הפרמטר האחרון

  const updateQuery = `UPDATE products SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;

  try {
    const updatedProduct = await pool.query(updateQuery, values);
    if (updatedProduct.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found for update.' });
    }
    res.status(200).json(updatedProduct.rows[0]);
  } catch (err) {
    console.error(`Error in updateProduct for id ${id}:`, err.message);
    next(err);
  }
};

const deleteProduct = async (req, res, next) => {
  const { id } = req.params;
  const numericProductId = parseInt(id, 10);
  if (isNaN(numericProductId)) {
    return res.status(400).json({ error: 'Invalid product ID format.' });
  }

  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [numericProductId]);
    if (result.rowCount === 0) { // rowCount יראה אם משהו נמחק
      return res.status(404).json({ error: 'Product not found for deletion.' });
    }
    res.status(204).send(); // No Content, מחיקה מוצלחת
  } catch (err) {
    // בדוק אם השגיאה היא בגלל FOREIGN KEY constraint (למשל, אם יש דיווחי מחירים המקושרים למוצר זה)
    if (err.code === '23503') { // קוד שגיאה של PostgreSQL להפרת מפתח זר
        console.error(`Error in deleteProduct (FK violation) for id ${id}:`, err.message);
        return res.status(409).json({ 
            error: 'Cannot delete product as it is referenced by other records (e.g., price reports).',
            details: err.message 
        });
    }
    console.error(`Error in deleteProduct for id ${id}:`, err.message);
    next(err);
  }
};

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,   // הוספנו
  updateProduct,   // הוספנו
  deleteProduct    // הוספנו
};
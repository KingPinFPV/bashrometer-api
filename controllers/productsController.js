// controllers/productsController.js
const pool = require('../db');
const { calcPricePer100g } = require('../utils/priceCalculator');

const getAllProducts = async (req, res) => {
  // ... כל הקוד של getAllProducts שהכנסנו קודם ...
  const { limit = 10, offset = 0, category, brand, kosher_level, animal_type, name_like } = req.query;
  const queryParams = [];
  let paramIndex = 1;

  let baseQuery = `
    SELECT 
      p.id, p.name, p.brand, p.short_description, p.image_url, p.category, 
      p.unit_of_measure, p.is_active, p.origin_country, p.kosher_level, p.animal_type,
      p.cut_type, p.description, p.default_weight_per_unit_grams,
      (
        SELECT MIN(sub_pr.regular_price / 
                   CASE 
                     WHEN sub_pr.unit_for_price = 'kg' THEN (sub_pr.quantity_for_price * 10) -- מחיר לק"ג חלקי 10 = מחיר ל100ג
                     WHEN sub_pr.unit_for_price = 'g' THEN (sub_pr.quantity_for_price / 100) -- מחיר לגרם כפול 100 = מחיר ל100ג
                     WHEN sub_pr.unit_for_price IN ('unit', 'package') AND p_sub.default_weight_per_unit_grams > 0 
                          THEN (sub_pr.quantity_for_price * p_sub.default_weight_per_unit_grams / 100) -- משקל כולל ב"יחידות של 100ג"
                     ELSE sub_pr.quantity_for_price -- אם זה כבר ל100ג, או יחידה ללא משקל מוגדר (בעייתי)
                   END)
        FROM prices sub_pr
        JOIN products p_sub ON sub_pr.product_id = p_sub.id
        WHERE sub_pr.product_id = p.id 
          AND sub_pr.status = 'approved' 
          AND (sub_pr.price_valid_to IS NULL OR sub_pr.price_valid_to >= CURRENT_DATE)
      ) as min_price_per_100g 
    FROM products p
    WHERE p.is_active = TRUE
  `; //הערה: החישוב כאן של min_price_per_100g עודכן לנסות לחשב ישירות ב-SQL
     // זה יכול להיות מורכב ופחות קריא מהחישוב באפליקציה. 
     // אם זה מסבך, אפשר לחזור לחישוב באפליקציה לאחר שליפת המחיר הנמוך.
     // בינתיים נשאיר את השאילתה המקורית יותר פשוטה:

  baseQuery = `
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
                WHEN pr.unit_for_price IN ('unit', 'package') AND p.default_weight_per_unit_grams > 0 THEN 
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
    WHERE p.is_active = TRUE
  `;


  if (category) { baseQuery += ` AND LOWER(p.category) LIKE LOWER($${paramIndex++})`; queryParams.push(`%${category}%`); }
  if (brand) { baseQuery += ` AND LOWER(p.brand) LIKE LOWER($${paramIndex++})`; queryParams.push(`%${brand}%`); }
  if (kosher_level) { baseQuery += ` AND p.kosher_level = $${paramIndex++}`; queryParams.push(kosher_level); }
  if (animal_type) { baseQuery += ` AND LOWER(p.animal_type) LIKE LOWER($${paramIndex++})`; queryParams.push(`%${animal_type}%`); }
  if (name_like) { baseQuery += ` AND LOWER(p.name) LIKE LOWER($${paramIndex++})`; queryParams.push(`%${name_like}%`); }

  const countQueryBase = baseQuery.substring(baseQuery.toLowerCase().indexOf("from products p"));
  const countQuery = `SELECT COUNT(*) FROM (SELECT p.id ${countQueryBase.replace(/\(\s*SELECT ROUND\(MIN.*?\) as min_price_per_100g/s, '')}) AS products_count_subquery`;


  baseQuery += ` ORDER BY p.name ASC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  queryParams.push(limit, offset);

  try {
    const result = await pool.query(baseQuery, queryParams);
    const countResult = await pool.query(countQuery, queryParams.slice(0, paramIndex - 3));

    res.json({
      data: result.rows.map(p => ({...p, min_price_per_100g: p.min_price_per_100g ? parseFloat(p.min_price_per_100g) : null })),
      page_info: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total_items: parseInt(countResult.rows[0].count),
        current_page_count: result.rows.length,
      }
    });
  } catch (err) {
    console.error('Error in getAllProducts:', err.message, err.stack);
    res.status(500).json({ error: 'Server error while fetching products', details: err.message });
  }
};

const getProductById = async (req, res) => {
  // ... כל הקוד של getProductById שהכנסנו קודם, כולל קריאה ל-calcPricePer100g ...
  const { id } = req.params;
  try {
    const productQuery = `
      SELECT 
        p.id, p.name, p.brand, p.origin_country, p.kosher_level, p.animal_type, 
        p.cut_type, p.description, p.category, p.unit_of_measure, 
        p.default_weight_per_unit_grams, p.image_url, p.short_description, p.is_active
      FROM products p
      WHERE p.id = $1
    `;
    const productResult = await pool.query(productQuery, [id]);

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const product = productResult.rows[0];

    const pricesQuery = `
      SELECT 
        r.id as retailer_id, r.name as retailer_name, 
        pr.id as price_id, pr.regular_price, pr.sale_price, pr.unit_for_price, 
        pr.quantity_for_price, pr.is_on_sale, pr.price_submission_date,
        pr.price_valid_to, pr.notes as price_notes
      FROM prices pr
      JOIN retailers r ON pr.retailer_id = r.id
      WHERE pr.product_id = $1 AND pr.status = 'approved' AND r.is_active = TRUE
      ORDER BY pr.price_submission_date DESC, r.name ASC
      LIMIT 10; 
    `;
    const pricesResult = await pool.query(pricesQuery, [id]);

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
    console.error(`Error in getProductById (id: ${id}):`, err.message, err.stack);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
};

module.exports = {
  getAllProducts,
  getProductById,
};
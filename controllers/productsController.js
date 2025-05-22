// controllers/productsController.js
const pool = require('../db');
const { calcPricePer100g } = require('../utils/priceCalculator'); // Adjust path if necessary

// GET /api/products
// Get all active products (potentially with filtering and pagination)
exports.getAllProducts = async (req, res) => {
  // Basic pagination (optional, can be enhanced)
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;

  // Basic filtering (examples - can be expanded)
  const { category, brand, kosher_level, animal_type, name_like } = req.query;
  
  let query = 'SELECT id, name, brand, short_description, image_url, category, unit_of_measure FROM products WHERE is_active = TRUE';
  const queryParams = [];
  let paramIndex = 1;

  if (category) {
    query += ` AND category ILIKE $${paramIndex++}`; // ILIKE for case-insensitive search
    queryParams.push(`%${category}%`);
  }
  if (brand) {
    query += ` AND brand ILIKE $${paramIndex++}`;
    queryParams.push(`%${brand}%`);
  }
  if (kosher_level) {
    query += ` AND kosher_level = $${paramIndex++}`;
    queryParams.push(kosher_level);
  }
  if (animal_type) {
    query += ` AND animal_type ILIKE $${paramIndex++}`;
    queryParams.push(`%${animal_type}%`);
  }
  if (name_like) {
    query += ` AND name ILIKE $${paramIndex++}`;
    queryParams.push(`%${name_like}%`);
  }

  query += ' ORDER BY name ASC';
  query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  queryParams.push(limit);
  queryParams.push(offset);

  try {
    const result = await pool.query(query, queryParams);
    // For total count (to assist pagination on client-side) - an additional query would be needed without limit/offset
    // const totalCountResult = await pool.query('SELECT COUNT(*) FROM products WHERE is_active = TRUE /* AND other filters */');
    // const totalCount = parseInt(totalCountResult.rows[0].count);

    res.json({
      data: result.rows,
      page_info: {
        limit,
        offset,
        // total_count: totalCount // if implemented
      }
    });
  } catch (err) {
    console.error('Error in getAllProducts:', err.message, err.stack);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
};

// GET /api/products/:id
// Get a single product by ID with price examples
exports.getProductById = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Fetch product details
    const productQuery = `
      SELECT 
        p.id, p.name, p.brand, p.origin_country, p.kosher_level, p.animal_type, 
        p.cut_type, p.description, p.category, p.unit_of_measure, 
        p.default_weight_per_unit_grams, p.image_url, p.short_description, p.is_active
      FROM products p
      WHERE p.id = $1
    `; // Removed p.is_active = TRUE here to allow viewing inactive products if accessed by ID,
       // but you might want to keep it or add a specific check if an inactive product should return 404.
    const productResult = await pool.query(productQuery, [id]);

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const product = productResult.rows[0];

    // If you want to prevent access to inactive products even by ID:
    // if (!product.is_active) {
    //   return res.status(404).json({ error: 'Product not found or is inactive' });
    // }


    // 2. Fetch associated prices with retailer names
    // This query can be optimized or made more specific based on requirements
    // e.g., distinct retailers, most recent price per retailer, etc.
    const pricesQuery = `
      SELECT 
        r.id as retailer_id,
        r.name as retailer_name, 
        pr.id as price_id,
        pr.regular_price, 
        pr.sale_price, 
        pr.unit_for_price, 
        pr.quantity_for_price,
        pr.is_on_sale,
        pr.price_submission_date,
        pr.price_valid_to,
        pr.notes as price_notes
      FROM prices pr
      JOIN retailers r ON pr.retailer_id = r.id
      WHERE pr.product_id = $1 AND pr.status = 'approved' AND r.is_active = TRUE
      ORDER BY pr.price_submission_date DESC, r.name ASC
      LIMIT 10; -- Example: Get up to 10 recent/relevant price examples
    `;
    const pricesResult = await pool.query(pricesQuery, [id]);

    // 3. Calculate price_per_100g for each price entry
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

    // 4. Construct the final response
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


// --- Placeholder for Admin Product Management Functions ---
// exports.createProduct = async (req, res) => { ... };
// exports.updateProduct = async (req, res) => { ... };
// exports.deleteProduct = async (req, res) => { ... };
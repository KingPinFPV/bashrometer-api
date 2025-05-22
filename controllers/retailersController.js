// controllers/retailersController.js
const pool = require('../db');

// GET /api/retailers
// Get all active retailers (potentially with filtering and pagination)
exports.getAllRetailers = async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;

  // Basic filtering examples
  const { chain, type, name_like } = req.query;

  let query = 'SELECT id, name, chain, address, type, website, phone, user_rating, rating_count FROM retailers WHERE is_active = TRUE';
  const queryParams = [];
  let paramIndex = 1;

  if (chain) {
    query += ` AND chain ILIKE $${paramIndex++}`;
    queryParams.push(`%${chain}%`);
  }
  if (type) {
    query += ` AND type ILIKE $${paramIndex++}`;
    queryParams.push(`%${type}%`);
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
    // For total count (to assist pagination on client-side) - an additional query would be needed
    // const totalCountResult = await pool.query('SELECT COUNT(*) FROM retailers WHERE is_active = TRUE /* AND other filters */');
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
    console.error('Error in getAllRetailers:', err.message, err.stack);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
};

// GET /api/retailers/:id
// Get a single retailer by ID
exports.getRetailerById = async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT 
        id, name, chain, address, type, geo_lat, geo_lon, 
        opening_hours, user_rating, rating_count, phone, website, notes, is_active 
      FROM retailers 
      WHERE id = $1
    `;
    // Similar to products, removed is_active = TRUE to allow fetching by ID even if inactive.
    // Add check if needed: if (!retailer.is_active) return res.status(404)...
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Retailer not found' });
    }
    const retailer = result.rows[0];

    // Future enhancement: could fetch some recent prices or popular products from this retailer here.

    res.json(retailer);
  } catch (err) {
    console.error(`Error in getRetailerById (id: ${id}):`, err.message, err.stack);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
};

// --- Placeholder for Admin Retailer Management Functions ---
// exports.createRetailer = async (req, res) => { ... };
// exports.updateRetailer = async (req, res) => { ... };
// exports.deleteRetailer = async (req, res) => { ... };
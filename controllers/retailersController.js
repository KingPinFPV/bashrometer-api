// controllers/retailersController.js
const pool = require('../db');

// אם תחליט להשתמש במחלקות שגיאה מותאמות, תצטרך לייבא אותן:
// const { NotFoundError, BadRequestError } = require('../utils/errors'); // התאם לנתיב שלך

const getAllRetailers = async (req, res, next) => { // הוספת next
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;
  const { chain, type, name_like, sort_by = 'name', order = 'ASC' } = req.query;

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
  
  const countQueryParams = [...queryParams]; // שכפל פרמטרים ל-WHERE clause של הספירה
  let countWhereClauses = " WHERE is_active = TRUE ";
  if (chain) { countWhereClauses += ` AND chain ILIKE $1`; } // התאם אינדקסים אם יש יותר פרמטרים
  if (type) { countWhereClauses += ` AND type ILIKE $${countQueryParams.findIndex(p => p.includes(type)) +1 }`;} // דוגמה להתאמה, עדיף לבנות את countQueryParams במקביל
  if (name_like) { countWhereClauses += ` AND name ILIKE $${countQueryParams.findIndex(p => p.includes(name_like)) +1 }`;}
  // דרך פשוטה יותר לבניית שאילתת הספירה:
  let simpleCountWhere = " WHERE is_active = TRUE ";
  const simpleCountParams = [];
  if (chain) { simpleCountWhere += ` AND chain ILIKE $${simpleCountParams.length + 1}`; simpleCountParams.push(`%${chain}%`); }
  if (type) { simpleCountWhere += ` AND type ILIKE $${simpleCountParams.length + 1}`; simpleCountParams.push(`%${type}%`); }
  if (name_like) { simpleCountWhere += ` AND name ILIKE $${simpleCountParams.length + 1}`; simpleCountParams.push(`%${name_like}%`); }
  const finalCountQuery = `SELECT COUNT(*) FROM retailers ${simpleCountWhere}`;


  const validSortColumns = {
    'name': 'name', 'chain': 'chain', 'type': 'type', 'user_rating': 'user_rating'
  };
  const sortColumn = validSortColumns[sort_by] || 'name';
  const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  query += ` ORDER BY ${sortColumn} ${sortOrder}`;

  query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  queryParams.push(limit);
  queryParams.push(offset);

  try {
    const totalCountResult = await pool.query(finalCountQuery, simpleCountParams);
    const totalItems = parseInt(totalCountResult.rows[0].count, 10);

    const result = await pool.query(query, queryParams);
    
    res.json({
      data: result.rows,
      page_info: {
        limit,
        offset,
        total_items: totalItems,
        current_page_count: result.rows.length,
        total_pages: Math.ceil(totalItems / limit)
      }
    });
  } catch (err) {
    console.error('Error in getAllRetailers:', err.message);
    next(err); 
  }
};

const getRetailerById = async (req, res, next) => { // הוספת next
  const { id } = req.params;

  const numericRetailerId = parseInt(id, 10);
  if (isNaN(numericRetailerId)) {
    // אם תרצה להשתמש במחלקות שגיאה מותאמות:
    // return next(new BadRequestError('Invalid retailer ID format. Must be an integer.'));
    return res.status(400).json({ error: 'Invalid retailer ID format. Must be an integer.' });
  }

  try {
    const query = `
      SELECT 
        id, name, chain, address, type, geo_lat, geo_lon, 
        opening_hours, user_rating, rating_count, phone, website, notes, is_active 
      FROM retailers 
      WHERE id = $1 
    `; 
    const result = await pool.query(query, [numericRetailerId]);

    if (result.rows.length === 0) {
      // אם תרצה להשתמש במחלקות שגיאה מותאמות:
      // return next(new NotFoundError('Retailer not found'));
      return res.status(404).json({ error: 'Retailer not found' });
    }
    const retailer = result.rows[0];
    res.json(retailer);
  } catch (err) {
    console.error(`Error in getRetailerById (id: ${id}):`, err.message);
    next(err); 
  }
};

// --- Placeholder for Admin Retailer Management Functions ---
// const createRetailer = async (req, res, next) => { ... try { ... } catch(err) { next(err); } };
// const updateRetailer = async (req, res, next) => { ... try { ... } catch(err) { next(err); } };
// const deleteRetailer = async (req, res, next) => { ... try { ... } catch(err) { next(err); } };

module.exports = {
    getAllRetailers, // כעת getAllRetailers הוא משתנה שמוגדר בסקופ הזה
    getRetailerById, // כנ"ל לגבי getRetailerById
    // createRetailer, 
    // updateRetailer,
    // deleteRetailer
};
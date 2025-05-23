// controllers/retailersController.js
const pool = require('../db');
// אם תחליט להשתמש במחלקות שגיאה מותאמות:
// const { NotFoundError, BadRequestError, ApplicationError } = require('../utils/errors');

// הפונקציה מוגדרת כקבוע
const getAllRetailers = async (req, res, next) => {
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;
  const { chain, type, name_like, sort_by = 'name', order = 'ASC' } = req.query;

  let query = 'SELECT id, name, chain, address, type, website, phone, user_rating, rating_count, is_active FROM retailers WHERE 1=1';
  const queryParams = [];
  let paramIndex = 1;

  if (req.user?.role !== 'admin') {
    query += ' AND is_active = TRUE';
  }

  if (chain) { query += ` AND chain ILIKE $${paramIndex++}`; queryParams.push(`%${chain}%`); }
  if (type) { query += ` AND type ILIKE $${paramIndex++}`; queryParams.push(`%${type}%`); }
  if (name_like) { query += ` AND name ILIKE $${paramIndex++}`; queryParams.push(`%${name_like}%`); }
  
  const countQueryParams = [];
  let countWhereClauses = " WHERE 1=1 ";
  if (req.user?.role !== 'admin') { countWhereClauses += ' AND is_active = TRUE';}
  if (chain) { countWhereClauses += ` AND chain ILIKE $${countQueryParams.length + 1}`; countQueryParams.push(`%${chain}%`); }
  if (type) { countWhereClauses += ` AND type ILIKE $${countQueryParams.length + 1}`; countQueryParams.push(`%${type}%`); }
  if (name_like) { countWhereClauses += ` AND name ILIKE $${countQueryParams.length + 1}`; countQueryParams.push(`%${name_like}%`); }
  const finalCountQuery = `SELECT COUNT(*) FROM retailers ${countWhereClauses}`;

  const validSortColumns = { 'name': 'name', 'chain': 'chain', 'type': 'type', 'user_rating': 'user_rating' };
  const sortColumn = validSortColumns[sort_by] || 'name';
  const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  query += ` ORDER BY ${sortColumn} ${sortOrder}`;

  query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  queryParams.push(limit);
  queryParams.push(offset);

  try {
    const totalCountResult = await pool.query(finalCountQuery, countQueryParams);
    const totalItems = parseInt(totalCountResult.rows[0].count, 10);
    const result = await pool.query(query, queryParams);
    
    res.json({
      data: result.rows,
      page_info: {
        limit, offset, total_items: totalItems,
        current_page_count: result.rows.length,
        total_pages: Math.ceil(totalItems / limit)
      }
    });
  } catch (err) {
    console.error('Error in getAllRetailers:', err.message);
    next(err); 
  }
};

// הפונקציה מוגדרת כקבוע
const getRetailerById = async (req, res, next) => {
  const { id } = req.params;
  const numericRetailerId = parseInt(id, 10);
  if (isNaN(numericRetailerId)) {
    return res.status(400).json({ error: 'Invalid retailer ID format. Must be an integer.' });
  }

  try {
    const queryText = `
      SELECT id, name, chain, address, type, geo_lat, geo_lon, 
             opening_hours, user_rating, rating_count, phone, website, notes, is_active 
      FROM retailers 
      WHERE id = $1
    `;
    const result = await pool.query(queryText, [numericRetailerId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Retailer not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(`Error in getRetailerById (id: ${id}):`, err.message);
    next(err); 
  }
};

// הפונקציה מוגדרת כקבוע
const createRetailer = async (req, res, next) => {
  const {
    name, chain, address, type, geo_lat, geo_lon,
    opening_hours, phone, website, notes, is_active = true
  } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: 'Retailer name and type are required.' });
  }

  try {
    const newRetailer = await pool.query(
      `INSERT INTO retailers 
        (name, chain, address, type, geo_lat, geo_lon, opening_hours, phone, website, notes, is_active) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        name, chain || null, address || null, type, 
        geo_lat ? parseFloat(geo_lat) : null, 
        geo_lon ? parseFloat(geo_lon) : null, 
        opening_hours || null, phone || null, website || null, notes || null, 
        typeof is_active === 'boolean' ? is_active : true
      ]
    );
    res.status(201).json(newRetailer.rows[0]);
  } catch (err) {
    console.error('Error in createRetailer:', err.message);
    next(err);
  }
};

// הפונקציה מוגדרת כקבוע
const updateRetailer = async (req, res, next) => {
  const { id } = req.params;
  const numericRetailerId = parseInt(id, 10);
  if (isNaN(numericRetailerId)) {
    return res.status(400).json({ error: 'Invalid retailer ID format.' });
  }

  const {
    name, chain, address, type, geo_lat, geo_lon,
    opening_hours, phone, website, notes, is_active
  } = req.body;

  const fields = [];
  const values = [];
  let paramCount = 1;

  if (name !== undefined) { fields.push(`name = $${paramCount++}`); values.push(name); }
  if (chain !== undefined) { fields.push(`chain = $${paramCount++}`); values.push(chain); }
  if (address !== undefined) { fields.push(`address = $${paramCount++}`); values.push(address); }
  if (type !== undefined) { fields.push(`type = $${paramCount++}`); values.push(type); }
  if (geo_lat !== undefined) { fields.push(`geo_lat = $${paramCount++}`); values.push(geo_lat ? parseFloat(geo_lat) : null); }
  if (geo_lon !== undefined) { fields.push(`geo_lon = $${paramCount++}`); values.push(geo_lon ? parseFloat(geo_lon) : null); }
  if (opening_hours !== undefined) { fields.push(`opening_hours = $${paramCount++}`); values.push(opening_hours); }
  if (phone !== undefined) { fields.push(`phone = $${paramCount++}`); values.push(phone); }
  if (website !== undefined) { fields.push(`website = $${paramCount++}`); values.push(website); }
  if (notes !== undefined) { fields.push(`notes = $${paramCount++}`); values.push(notes); }
  if (is_active !== undefined) { fields.push(`is_active = $${paramCount++}`); values.push(is_active); }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields provided for update.' });
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(numericRetailerId);

  const updateQuery = `UPDATE retailers SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;

  try {
    const updatedRetailer = await pool.query(updateQuery, values);
    if (updatedRetailer.rows.length === 0) {
      return res.status(404).json({ error: 'Retailer not found for update.' });
    }
    res.status(200).json(updatedRetailer.rows[0]);
  } catch (err) {
    console.error(`Error in updateRetailer for id ${id}:`, err.message);
    next(err);
  }
};

// הפונקציה מוגדרת כקבוע
const deleteRetailer = async (req, res, next) => {
  const { id } = req.params;
  const numericRetailerId = parseInt(id, 10);
  if (isNaN(numericRetailerId)) {
    return res.status(400).json({ error: 'Invalid retailer ID format.' });
  }

  try {
    const result = await pool.query('DELETE FROM retailers WHERE id = $1 RETURNING *', [numericRetailerId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Retailer not found for deletion.' });
    }
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') { 
        console.error(`Error in deleteRetailer (FK violation) for id ${id}:`, err.message);
        return res.status(409).json({ 
            error: 'Cannot delete retailer as it is referenced by other records (e.g., price reports).',
            details: err.message 
        });
    }
    console.error(`Error in deleteRetailer for id ${id}:`, err.message);
    next(err);
  }
};

module.exports = {
    getAllRetailers,
    getRetailerById,
    createRetailer,
    updateRetailer,
    deleteRetailer
};
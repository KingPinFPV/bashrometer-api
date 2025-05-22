// controllers/authController.js
const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || "devsecret_fallback_do_not_use_in_prod"; // Fallback only for dev if .env is missing

// Register new user
exports.register = async (req, res) => {
  const { name, email, password, role = 'user' } // Default role to 'user'
    = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  // Basic email format validation
  if (!/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }
  // Basic password length validation
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  try {
    const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (userExists.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const password_hash = await bcrypt.hash(password, 10); // Salt rounds = 10
    
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
      [name, email.toLowerCase(), password_hash, role]
    );
    const user = result.rows[0];

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '2h' } // Token expiration time
    );

    res.status(201).json({ 
      message: 'User registered successfully.',
      user: { id: user.id, name: user.name, email: user.email, role: user.role, created_at: user.created_at }, 
      token 
    });

  } catch (err) {
    console.error('Error in register controller:', err.message, err.stack);
    res.status(500).json({ error: 'Server error during registration.', details: err.message });
  }
};

// Login
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const result = await pool.query('SELECT id, name, email, password_hash, role FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials.' }); // Generic error
    }
    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' }); // Generic error
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Do not send password_hash to client
    delete user.password_hash; 
    res.json({ 
      message: 'Login successful.',
      user, 
      token 
    });

  } catch (err) {
    console.error('Error in login controller:', err.message, err.stack);
    res.status(500).json({ error: 'Server error during login.', details: err.message });
  }
};

// Get current user info (protected)
exports.me = async (req, res) => {
  // req.user is populated by authenticateToken middleware
  const loggedInUser = req.user; 

  try {
    // Fetch user details from DB to ensure they are up-to-date and the user still exists
    const result = await pool.query('SELECT id, name, email, role, created_at FROM users WHERE id = $1', [loggedInUser.id]);
    if (result.rows.length === 0) {
      // This case might happen if user was deleted after token was issued
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error in me controller:', err.message, err.stack);
    res.status(500).json({ error: 'Server error fetching user data.', details: err.message });
  }
};
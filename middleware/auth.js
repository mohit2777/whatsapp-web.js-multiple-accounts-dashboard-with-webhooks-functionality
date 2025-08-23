const bcrypt = require('bcryptjs');
require('dotenv').config();

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  if (req.session && req.session.authenticated) {
    return next();
  }
  
  // For API routes, return JSON error
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please login to access this resource'
    });
  }
  
  // For web routes, redirect to login
  res.redirect('/login');
};

// Middleware to check if user is not authenticated (for login page)
const requireGuest = (req, res, next) => {
  if (req.session && req.session.authenticated) {
    return res.redirect('/dashboard');
  }
  next();
};

// Login handler
const login = async (req, res) => {
  const { username, password } = req.body;
  
  const expectedUsername = process.env.DASHBOARD_USERNAME || 'admin';
  const expectedPassword = process.env.DASHBOARD_PASSWORD || 'admin123';
  
  try {
    // Check username and password
    if (username === expectedUsername && await bcrypt.compare(password, await bcrypt.hash(expectedPassword, 10))) {
      req.session.authenticated = true;
      req.session.username = username;
      req.session.loginTime = new Date();
      
      return res.json({ 
        success: true, 
        message: 'Login successful',
        redirect: '/dashboard'
      });
    } else {
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'Username or password is incorrect'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      error: 'Login failed',
      message: 'An error occurred during login'
    });
  }
};

// Logout handler
const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ 
        error: 'Logout failed',
        message: 'An error occurred during logout'
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Logout successful',
      redirect: '/login'
    });
  });
};

// Get current user info
const getCurrentUser = (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.json({
      authenticated: true,
      username: req.session.username,
      loginTime: req.session.loginTime
    });
  }
  
  res.json({ authenticated: false });
};

module.exports = {
  requireAuth,
  requireGuest,
  login,
  logout,
  getCurrentUser
}; 
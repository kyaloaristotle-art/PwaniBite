const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Protect sensitive files and directories from static exposure
app.use((req, res, next) => {
    const forbiddenPatterns = [
        /^\/\.env/i,
        /^\/backend/i,
        /^\/\.git/i,
        /^\/\.vscode/i,
        /package(-lock)?\.json$/i
    ];
    if (forbiddenPatterns.some(pattern => pattern.test(req.path))) {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
});

// Serve static files from frontend
app.use(express.static(path.join(__dirname, '..'), {
    dotfiles: 'deny'
}));

// Database connection
const db = require('./config/database');

// Test database connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    }
    console.log('✅ Database connected successfully');
    connection.release();
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/food', require('./routes/food'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/delivery', require('./routes/delivery'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/mpesa', require('./routes/mpesa'));

// Root route
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to Pwani Bite API',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            users: '/api/users',
            food: '/api/food',
            orders: '/api/orders',
            payments: '/api/payments',
            delivery: '/api/delivery',
            feedback: '/api/feedback',
            reports: '/api/reports',
            mpesa: '/api/mpesa'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        message: `Cannot ${req.method} ${req.path}`
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Server URL: http://localhost:${PORT}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/api`);
});

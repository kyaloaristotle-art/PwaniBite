const jwt = require('jsonwebtoken');
require('dotenv').config();

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            error: 'Access denied',
            message: 'No token provided'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({
                error: 'Invalid token',
                message: 'Token verification failed'
            });
        }

        req.user = user;
        next();
    });
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Access denied',
            message: 'Admin access required'
        });
    }
    next();
};

// Middleware to check if user is admin or delivery
const requireAdminOrDelivery = (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'delivery') {
        return res.status(403).json({
            error: 'Access denied',
            message: 'Admin or delivery access required'
        });
    }
    next();
};

// Middleware to check if user is customer
const requireCustomer = (req, res, next) => {
    if (req.user.role !== 'customer') {
        return res.status(403).json({
            error: 'Access denied',
            message: 'Customer access required'
        });
    }
    next();
};

module.exports = {
    authenticateToken,
    requireAdmin,
    requireAdminOrDelivery,
    requireCustomer
};

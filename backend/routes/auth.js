const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const rateLimiter = require('../middleware/rateLimiter');

// Rate limiter for authentication attempts (20 attempts per 15 minutes)
const authLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many authentication attempts. Please try again after 15 minutes.'
});

// Register a new user
router.post('/register', authLimiter, [
    body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('email').isEmail().withMessage('Valid email required'),
    body('phone').matches(/^(07|01)[0-9]{8}$/).withMessage('Invalid Kenyan phone number'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('hostel').optional().trim(),
    body('block').optional().trim(),
    body('room').optional().trim()
], async (req, res) => {
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, email, phone, password, hostel, block, room } = req.body;

        // Check if user already exists
        const [existingUsers] = await db.promisePool.query(
            'SELECT user_id FROM users WHERE email = ? OR phone = ?',
            [email, phone]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({
                error: 'User already exists',
                message: 'A user with this email or phone number already exists'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        const [result] = await db.promisePool.query(
            'INSERT INTO users (name, email, phone, password, hostel, block, room, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [name, email, phone, hashedPassword, hostel, block, room, 'customer']
        );

        // Generate JWT token
        const token = jwt.sign(
            { userId: result.insertId, email, role: 'customer' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                user_id: result.insertId,
                name,
                email,
                phone,
                hostel,
                block,
                room,
                role: 'customer'
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            error: 'Registration failed',
            message: error.message
        });
    }
});

// Login user
router.post('/login', authLimiter, [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').exists().withMessage('Password required')
], async (req, res) => {
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;

        // Find user
        const [users] = await db.promisePool.query(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({
                error: 'Login failed',
                message: 'Invalid email or password'
            });
        }

        const user = users[0];

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({
                error: 'Login failed',
                message: 'Invalid email or password'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.user_id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE || '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                user_id: user.user_id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                hostel: user.hostel,
                block: user.block,
                room: user.room,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Login failed',
            message: error.message
        });
    }
});

// Get current user info
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                error: 'Access denied',
                message: 'No token provided'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const [users] = await db.promisePool.query(
            'SELECT user_id, name, email, phone, hostel, block, room, role, created_at FROM users WHERE user_id = ?',
            [decoded.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        res.json({ user: users[0] });

    } catch (error) {
        console.error('Get user error:', error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Invalid token', message: 'Please sign in again.' });
        }
        res.status(500).json({ error: 'Failed to get user info', message: error.message });
    }
});

module.exports = router;

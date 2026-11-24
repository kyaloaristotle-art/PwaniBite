const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin, requireCustomer } = require('../middleware/auth');
const db = require('../config/database');

// Get all feedback (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [feedback] = await db.promisePool.query(
            `
            SELECT f.*, u.name as customer_name, o.order_number
            FROM feedback f
            JOIN users u ON f.user_id = u.user_id
            JOIN orders o ON f.order_id = o.order_id
            ORDER BY f.created_at DESC
            `
        );

        res.json({ feedback });

    } catch (error) {
        console.error('Get feedback error:', error);
        res.status(500).json({
            error: 'Failed to fetch feedback',
            message: error.message
        });
    }
});

// Get feedback by order ID
router.get('/order/:orderId', authenticateToken, async (req, res) => {
    try {
        const [feedback] = await db.promisePool.query(
            `SELECT f.* FROM feedback f
             JOIN orders o ON o.order_id = f.order_id
             WHERE f.order_id = ? AND (o.user_id = ? OR ? = 'admin')`,
            [req.params.orderId, req.user.userId, req.user.role]
        );

        if (feedback.length === 0) {
            return res.status(404).json({
                error: 'Feedback not found'
            });
        }

        res.json({ feedback: feedback[0] });

    } catch (error) {
        console.error('Get feedback error:', error);
        res.status(500).json({
            error: 'Failed to fetch feedback',
            message: error.message
        });
    }
});

// Get current user's feedback
router.get('/my-feedback', authenticateToken, requireCustomer, async (req, res) => {
    try {
        const [feedback] = await db.promisePool.query(
            `
            SELECT f.*, o.order_number
            FROM feedback f
            JOIN orders o ON f.order_id = o.order_id
            WHERE f.user_id = ?
            ORDER BY f.created_at DESC
            `,
            [req.user.userId]
        );

        res.json({ feedback });

    } catch (error) {
        console.error('Get my feedback error:', error);
        res.status(500).json({
            error: 'Failed to fetch feedback',
            message: error.message
        });
    }
});

// Submit feedback
router.post('/', authenticateToken, requireCustomer, async (req, res) => {
    try {
        const { order_id, food_rating, delivery_rating, overall_rating, recommend, comments } = req.body;

        // Check if order exists and belongs to user
        const [orders] = await db.promisePool.query(
            'SELECT * FROM orders WHERE order_id = ? AND user_id = ?',
            [order_id, req.user.userId]
        );

        if (orders.length === 0) {
            return res.status(404).json({
                error: 'Order not found'
            });
        }

        // Check if feedback already exists
        const [existingFeedback] = await db.promisePool.query(
            'SELECT * FROM feedback WHERE order_id = ?',
            [order_id]
        );

        if (existingFeedback.length > 0) {
            return res.status(400).json({
                error: 'Feedback already exists',
                message: 'You have already submitted feedback for this order'
            });
        }

        // Insert feedback
        const [result] = await db.promisePool.query(
            'INSERT INTO feedback (user_id, order_id, food_rating, delivery_rating, overall_rating, recommend, comments) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.user.userId, order_id, food_rating, delivery_rating, overall_rating, recommend, comments]
        );

        res.status(201).json({
            message: 'Feedback submitted successfully',
            feedback_id: result.insertId
        });

    } catch (error) {
        console.error('Submit feedback error:', error);
        res.status(500).json({
            error: 'Failed to submit feedback',
            message: error.message
        });
    }
});

// Get average ratings (admin only)
router.get('/stats/average', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [stats] = await db.promisePool.query(
            `
            SELECT
                AVG(food_rating) as avg_food_rating,
                AVG(delivery_rating) as avg_delivery_rating,
                AVG(overall_rating) as avg_overall_rating,
                COUNT(*) as total_feedback,
                SUM(CASE WHEN recommend = 1 THEN 1 ELSE 0 END) as would_recommend
            FROM feedback
            `
        );

        res.json({ stats: stats[0] });

    } catch (error) {
        console.error('Get average ratings error:', error);
        res.status(500).json({
            error: 'Failed to fetch average ratings',
            message: error.message
        });
    }
});

module.exports = router;

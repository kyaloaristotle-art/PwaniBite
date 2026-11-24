const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const db = require('../config/database');

// Get all payments (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, start_date, end_date } = req.query;

        let query = `
            SELECT p.*, o.order_number, o.total_amount as order_total
            FROM payments p
            JOIN orders o ON p.order_id = o.order_id
        `;
        const params = [];

        if (status) {
            query += ' WHERE p.payment_status = ?';
            params.push(status);
        }

        if (start_date) {
            if (params.length > 0) {
                query += ' AND DATE(p.payment_date) >= ?';
            } else {
                query += ' WHERE DATE(p.payment_date) >= ?';
            }
            params.push(start_date);
        }

        if (end_date) {
            if (params.length > 0) {
                query += ' AND DATE(p.payment_date) <= ?';
            } else {
                query += ' WHERE DATE(p.payment_date) <= ?';
            }
            params.push(end_date);
        }

        query += ' ORDER BY p.payment_date DESC';

        const [payments] = await db.promisePool.query(query, params);

        res.json({ payments });

    } catch (error) {
        console.error('Get payments error:', error);
        res.status(500).json({
            error: 'Failed to fetch payments',
            message: error.message
        });
    }
});

// Get payment by order ID
router.get('/order/:orderId', authenticateToken, async (req, res) => {
    try {
        const [payments] = await db.promisePool.query(
            'SELECT p.*, o.user_id FROM payments p JOIN orders o ON p.order_id = o.order_id WHERE p.order_id = ?',
            [req.params.orderId]
        );

        if (payments.length === 0) {
            return res.status(404).json({
                error: 'Payment not found'
            });
        }

        const payment = payments[0];

        // Authorization check: User must own the order or be an admin
        if (req.user.role !== 'admin' && payment.user_id !== req.user.userId) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You are not authorized to view this payment'
            });
        }

        res.json({ payment });

    } catch (error) {
        console.error('Get payment error:', error);
        res.status(500).json({
            error: 'Failed to fetch payment',
            message: error.message
        });
    }
});

// Create payment
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { order_id, payment_method } = req.body;

        // M-Pesa payments must be initiated through /api/mpesa/stkpush so their
        // status is set only after the provider callback confirms the charge.
        if (payment_method !== 'Cash') {
            return res.status(400).json({
                error: 'Unsupported payment method',
                message: 'Use the M-Pesa checkout flow for M-Pesa payments.'
            });
        }

        // Check if order exists
        const [orders] = await db.promisePool.query(
            'SELECT * FROM orders WHERE order_id = ?',
            [order_id]
        );

        if (orders.length === 0) {
            return res.status(404).json({
                error: 'Order not found'
            });
        }

        const order = orders[0];

        if (order.order_status === 'Cancelled') {
            return res.status(400).json({ error: 'Cancelled order', message: 'A cancelled order cannot be paid.' });
        }

        // Authorization check: User must own the order or be an admin
        if (req.user.role !== 'admin' && order.user_id !== req.user.userId) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You are not authorized to record payment for this order'
            });
        }

        // Check if payment already exists
        const [existingPayments] = await db.promisePool.query(
            'SELECT * FROM payments WHERE order_id = ?',
            [order_id]
        );

        if (existingPayments.length > 0) {
            return res.status(400).json({
                error: 'Payment already exists',
                message: 'This order already has a payment record'
            });
        }

        // Insert payment
        const [result] = await db.promisePool.query(
            'INSERT INTO payments (order_id, payment_method, amount, payment_status) VALUES (?, ?, ?, ?)',
            [order_id, payment_method, order.total_amount, 'Pending']
        );

        res.status(201).json({
            message: 'Payment recorded successfully',
            payment_id: result.insertId
        });

    } catch (error) {
        console.error('Create payment error:', error);
        res.status(500).json({
            error: 'Failed to create payment',
            message: error.message
        });
    }
});

// Update payment status (admin only)
router.put('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { payment_status } = req.body;

        const validStatuses = ['Pending', 'Completed', 'Failed', 'Refunded'];
        if (!validStatuses.includes(payment_status)) {
            return res.status(400).json({
                error: 'Invalid status',
                message: 'Invalid payment status'
            });
        }

        const [result] = await db.promisePool.query(
            'UPDATE payments SET payment_status = ? WHERE payment_id = ?',
            [payment_status, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: 'Payment not found'
            });
        }

        res.json({
            message: 'Payment status updated successfully'
        });

    } catch (error) {
        console.error('Update payment status error:', error);
        res.status(500).json({
            error: 'Failed to update payment status',
            message: error.message
        });
    }
});

module.exports = router;

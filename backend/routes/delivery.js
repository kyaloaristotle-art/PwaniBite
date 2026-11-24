const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin, requireAdminOrDelivery } = require('../middleware/auth');
const db = require('../config/database');

// Get all delivery records (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, start_date, end_date } = req.query;

        let query = `
            SELECT d.*, o.order_number, o.order_status, u.name as delivery_person_name
            FROM delivery d
            JOIN orders o ON d.order_id = o.order_id
            LEFT JOIN users u ON d.delivery_person_id = u.user_id
        `;
        const params = [];

        if (status) {
            query += ' WHERE d.delivery_status = ?';
            params.push(status);
        }

        if (start_date) {
            if (params.length > 0) {
                query += ' AND DATE(d.created_at) >= ?';
            } else {
                query += ' WHERE DATE(d.created_at) >= ?';
            }
            params.push(start_date);
        }

        if (end_date) {
            if (params.length > 0) {
                query += ' AND DATE(d.created_at) <= ?';
            } else {
                query += ' WHERE DATE(d.created_at) <= ?';
            }
            params.push(end_date);
        }

        query += ' ORDER BY d.created_at DESC';

        const [deliveries] = await db.promisePool.query(query, params);

        res.json({ deliveries });

    } catch (error) {
        console.error('Get deliveries error:', error);
        res.status(500).json({
            error: 'Failed to fetch deliveries',
            message: error.message
        });
    }
});

// Get delivery by order ID
router.get('/order/:orderId', authenticateToken, async (req, res) => {
    try {
        const [deliveries] = await db.promisePool.query(
            'SELECT d.*, u.name as delivery_person_name, o.user_id as customer_id FROM delivery d LEFT JOIN users u ON d.delivery_person_id = u.user_id JOIN orders o ON d.order_id = o.order_id WHERE d.order_id = ?',
            [req.params.orderId]
        );

        if (deliveries.length === 0) {
            return res.status(404).json({
                error: 'Delivery not found'
            });
        }

        const delivery = deliveries[0];

        // Authorization check: Customer owning order, assigned delivery person, or admin
        if (req.user.role !== 'admin' && delivery.delivery_person_id !== req.user.userId && delivery.customer_id !== req.user.userId) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You are not authorized to view this delivery'
            });
        }

        res.json({ delivery });

    } catch (error) {
        console.error('Get delivery error:', error);
        res.status(500).json({
            error: 'Failed to fetch delivery',
            message: error.message
        });
    }
});

// Get assigned deliveries for delivery person
router.get('/my-deliveries', authenticateToken, requireAdminOrDelivery, async (req, res) => {
    try {
        const [deliveries] = await db.promisePool.query(
            `
            SELECT d.*, o.order_number, o.order_status, o.hostel, o.block, o.room, o.delivery_location,
                   u.name as customer_name, u.phone as customer_phone
            FROM delivery d
            JOIN orders o ON d.order_id = o.order_id
            JOIN users u ON o.user_id = u.user_id
            WHERE d.delivery_person_id = ?
            ORDER BY d.created_at DESC
            `,
            [req.user.userId]
        );

        res.json({ deliveries });

    } catch (error) {
        console.error('Get my deliveries error:', error);
        res.status(500).json({
            error: 'Failed to fetch deliveries',
            message: error.message
        });
    }
});

// Assign delivery person (admin only)
router.post('/assign', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { order_id, delivery_person_id } = req.body;

        // Check if delivery record exists
        const [existingDeliveries] = await db.promisePool.query(
            'SELECT * FROM delivery WHERE order_id = ?',
            [order_id]
        );

        if (existingDeliveries.length > 0) {
            // Update existing delivery
            await db.promisePool.query(
                'UPDATE delivery SET delivery_person_id = ?, delivery_status = ?, assigned_at = NOW() WHERE order_id = ?',
                [delivery_person_id, 'Assigned', order_id]
            );
        } else {
            // Create new delivery record
            const [order] = await db.promisePool.query(
                'SELECT delivery_location FROM orders WHERE order_id = ?',
                [order_id]
            );

            if (order.length === 0) {
                return res.status(404).json({
                    error: 'Order not found'
                });
            }

            await db.promisePool.query(
                'INSERT INTO delivery (order_id, delivery_person_id, location, delivery_status, assigned_at) VALUES (?, ?, ?, ?, NOW())',
                [order_id, delivery_person_id, order[0].delivery_location, 'Assigned']
            );
        }

        res.json({
            message: 'Delivery assigned successfully'
        });

    } catch (error) {
        console.error('Assign delivery error:', error);
        res.status(500).json({
            error: 'Failed to assign delivery',
            message: error.message
        });
    }
});

// Update delivery status (admin or delivery person)
router.put('/:id/status', authenticateToken, requireAdminOrDelivery, async (req, res) => {
    try {
        const { delivery_status } = req.body;

        const validStatuses = ['Pending', 'Assigned', 'Picked Up', 'In Transit', 'Delivered', 'Failed'];
        if (!validStatuses.includes(delivery_status)) {
            return res.status(400).json({
                error: 'Invalid status',
                message: 'Invalid delivery status'
            });
        }

        // Verify that delivery exists and user is assigned (or admin)
        const [existing] = await db.promisePool.query(
            'SELECT * FROM delivery WHERE delivery_id = ?',
            [req.params.id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                error: 'Delivery not found'
            });
        }

        if (req.user.role !== 'admin' && existing[0].delivery_person_id !== req.user.userId) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You are not assigned to this delivery'
            });
        }

        let query = 'UPDATE delivery SET delivery_status = ?';
        const params = [delivery_status];

        if (delivery_status === 'Picked Up') {
            query += ', picked_up_at = NOW()';
        } else if (delivery_status === 'Delivered') {
            query += ', delivered_at = NOW()';
        }

        query += ' WHERE delivery_id = ?';
        params.push(req.params.id);

        const [result] = await db.promisePool.query(query, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: 'Delivery not found'
            });
        }

        // If delivered, update order status
        if (delivery_status === 'Delivered') {
            const [delivery] = await db.promisePool.query(
                'SELECT order_id FROM delivery WHERE delivery_id = ?',
                [req.params.id]
            );

            if (delivery.length > 0) {
                await db.promisePool.query(
                    'UPDATE orders SET order_status = ? WHERE order_id = ?',
                    ['Delivered', delivery[0].order_id]
                );
            }
        }

        res.json({
            message: 'Delivery status updated successfully'
        });

    } catch (error) {
        console.error('Update delivery status error:', error);
        res.status(500).json({
            error: 'Failed to update delivery status',
            message: error.message
        });
    }
});

// Add delivery notes
router.put('/:id/notes', authenticateToken, requireAdminOrDelivery, async (req, res) => {
    try {
        const { notes } = req.body;

        const [deliveries] = await db.promisePool.query(
            'SELECT delivery_person_id FROM delivery WHERE delivery_id = ?',
            [req.params.id]
        );
        if (deliveries.length === 0) {
            return res.status(404).json({ error: 'Delivery not found' });
        }
        if (req.user.role !== 'admin' && deliveries[0].delivery_person_id !== req.user.userId) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You are not assigned to this delivery'
            });
        }

        await db.promisePool.query(
            'UPDATE delivery SET notes = ? WHERE delivery_id = ?',
            [notes, req.params.id]
        );

        res.json({
            message: 'Delivery notes updated successfully'
        });

    } catch (error) {
        console.error('Update delivery notes error:', error);
        res.status(500).json({
            error: 'Failed to update delivery notes',
            message: error.message
        });
    }
});

module.exports = router;

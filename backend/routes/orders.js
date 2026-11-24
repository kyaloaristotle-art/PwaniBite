const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin, requireCustomer } = require('../middleware/auth');
const db = require('../config/database');

// Get all orders (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { status, start_date, end_date } = req.query;

        let query = `
            SELECT o.*, u.name as customer_name, u.phone as customer_phone
            FROM orders o
            JOIN users u ON o.user_id = u.user_id
        `;
        const params = [];

        if (status) {
            query += ' WHERE o.order_status = ?';
            params.push(status);
        }

        if (start_date) {
            if (params.length > 0) {
                query += ' AND DATE(o.order_date) >= ?';
            } else {
                query += ' WHERE DATE(o.order_date) >= ?';
            }
            params.push(start_date);
        }

        if (end_date) {
            if (params.length > 0) {
                query += ' AND DATE(o.order_date) <= ?';
            } else {
                query += ' WHERE DATE(o.order_date) <= ?';
            }
            params.push(end_date);
        }

        query += ' ORDER BY o.order_date DESC';

        const [orders] = await db.promisePool.query(query, params);

        // Get order items for each order
        for (const order of orders) {
            const [items] = await db.promisePool.query(
                'SELECT oi.*, f.food_name FROM order_items oi JOIN food f ON oi.food_id = f.food_id WHERE oi.order_id = ?',
                [order.order_id]
            );
            order.items = items;
        }

        res.json({ orders });

    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({
            error: 'Failed to fetch orders',
            message: error.message
        });
    }
});

// Get current user's orders
router.get('/my-orders', authenticateToken, requireCustomer, async (req, res) => {
    try {
        const [orders] = await db.promisePool.query(
            'SELECT * FROM orders WHERE user_id = ? ORDER BY order_date DESC',
            [req.user.userId]
        );

        // Get order items for each order
        for (const order of orders) {
            const [items] = await db.promisePool.query(
                'SELECT oi.*, f.food_name FROM order_items oi JOIN food f ON oi.food_id = f.food_id WHERE oi.order_id = ?',
                [order.order_id]
            );
            order.items = items;
        }

        res.json({ orders });

    } catch (error) {
        console.error('Get my orders error:', error);
        res.status(500).json({
            error: 'Failed to fetch orders',
            message: error.message
        });
    }
});

// Get order by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const [orders] = await db.promisePool.query(
            'SELECT * FROM orders WHERE order_id = ?',
            [req.params.id]
        );

        if (orders.length === 0) {
            return res.status(404).json({
                error: 'Order not found'
            });
        }

        const order = orders[0];

        // Authorization check: User must own the order or be an admin
        if (req.user.role !== 'admin' && order.user_id !== req.user.userId) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You are not authorized to view this order'
            });
        }

        // Get order items
        const [items] = await db.promisePool.query(
            'SELECT oi.*, f.food_name FROM order_items oi JOIN food f ON oi.food_id = f.food_id WHERE oi.order_id = ?',
            [order.order_id]
        );
        order.items = items;

        res.json({ order });

    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({
            error: 'Failed to fetch order',
            message: error.message
        });
    }
});

// Create new order
router.post('/', authenticateToken, requireCustomer, async (req, res) => {
    const connection = await db.promisePool.getConnection();

    try {
        await connection.beginTransaction();

        const { items, delivery_location, hostel, block, room, delivery_time, special_instructions } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            await connection.rollback();
            return res.status(400).json({
                error: 'Invalid order',
                message: 'Order must contain at least one item'
            });
        }

        // Validate and calculate item subtotals from database
        let total = 0;
        const validatedItems = [];

        for (const item of items) {
            const quantity = Number(item.quantity);
            if (!Number.isSafeInteger(quantity) || quantity < 1) {
                await connection.rollback();
                return res.status(400).json({ error: 'Invalid quantity', message: 'Each item quantity must be a positive whole number.' });
            }

            // Lock inventory rows until this transaction commits so concurrent orders
            // cannot both consume the same remaining stock.
            let foods;
            if (item.food_id) {
                [foods] = await connection.query(
                    'SELECT food_id, food_name, price, availability, stock_quantity FROM food WHERE food_id = ? FOR UPDATE',
                    [item.food_id]
                );
            } else if (item.food_name || item.name) {
                [foods] = await connection.query(
                    'SELECT food_id, food_name, price, availability, stock_quantity FROM food WHERE food_name = ? FOR UPDATE',
                    [item.food_name || item.name]
                );
            } else {
                foods = [];
            }

            if (foods.length === 0) {
                await connection.rollback();
                return res.status(400).json({ error: 'Invalid item', message: 'One or more items are not available in the menu.' });
            }

            const food = foods[0];
            if (!food.availability || food.stock_quantity < quantity) {
                await connection.rollback();
                return res.status(400).json({
                    error: 'Out of stock',
                    message: `Sorry, "${food.food_name}" is currently out of stock or does not have enough quantity.`
                });
            }

            const foodId = food.food_id;
            const unitPrice = Number(food.price);

            await connection.query(
                `UPDATE food SET stock_quantity = stock_quantity - ?,
                    availability = CASE WHEN stock_quantity <= 0 THEN 0 ELSE availability END
                 WHERE food_id = ?`,
                [quantity, foodId]
            );

            const subtotal = unitPrice * quantity;
            total += subtotal;

            validatedItems.push({
                food_id: foodId,
                quantity: quantity,
                price: unitPrice,
                subtotal: subtotal
            });
        }

        if (validatedItems.length === 0) {
            await connection.rollback();
            return res.status(400).json({
                error: 'Invalid order',
                message: 'No valid items found in order'
            });
        }

        // Generate collision-resistant order number (e.g. PB84920193)
        const orderNumber = 'PB' + Date.now().toString().slice(-6) + Math.floor(10 + Math.random() * 90);

        // Insert order
        const [orderResult] = await connection.query(
            'INSERT INTO orders (order_number, user_id, total_amount, delivery_location, hostel, block, room, delivery_time, special_instructions, order_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [orderNumber, req.user.userId, total, delivery_location, hostel, block, room, delivery_time, special_instructions, 'Pending']
        );

        const orderId = orderResult.insertId;

        // Insert order items and decrement stock
        for (const item of validatedItems) {
            await connection.query(
                'INSERT INTO order_items (order_id, food_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)',
                [orderId, item.food_id, item.quantity, item.price, item.subtotal]
            );

        }

        await connection.commit();

        res.status(201).json({
            message: 'Order created successfully',
            order_id: orderId,
            order_number: orderNumber,
            total_amount: total
        });

    } catch (error) {
        await connection.rollback();
        console.error('Create order error:', error);
        res.status(500).json({
            error: 'Failed to create order',
            message: error.message
        });
    } finally {
        connection.release();
    }
});

// Update order status (admin only)
router.put('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { order_status } = req.body;

        const validStatuses = ['Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];
        if (!validStatuses.includes(order_status)) {
            return res.status(400).json({
                error: 'Invalid status',
                message: 'Invalid order status'
            });
        }

        const [result] = await db.promisePool.query(
            'UPDATE orders SET order_status = ? WHERE order_id = ?',
            [order_status, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: 'Order not found'
            });
        }

        res.json({
            message: 'Order status updated successfully'
        });

    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({
            error: 'Failed to update order status',
            message: error.message
        });
    }
});

// Cancel order (customer only, for their own orders)
router.put('/:id/cancel', authenticateToken, requireCustomer, async (req, res) => {
    const connection = await db.promisePool.getConnection();
    try {
        await connection.beginTransaction();
        const [orders] = await connection.query(
            'SELECT * FROM orders WHERE order_id = ? AND user_id = ? FOR UPDATE',
            [req.params.id, req.user.userId]
        );

        if (orders.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                error: 'Order not found'
            });
        }

        const order = orders[0];

        if (order.order_status !== 'Pending') {
            await connection.rollback();
            return res.status(400).json({
                error: 'Cannot cancel order',
                message: 'Only pending orders can be cancelled'
            });
        }

        await connection.query(
            'UPDATE orders SET order_status = ? WHERE order_id = ?',
            ['Cancelled', req.params.id]
        );

        const [cancelledItems] = await connection.query(
            'SELECT food_id, quantity FROM order_items WHERE order_id = ?',
            [req.params.id]
        );
        for (const cItem of cancelledItems) {
            await connection.query(
                `UPDATE food
                 SET stock_quantity = stock_quantity + ?,
                     availability = CASE WHEN stock_quantity > 0 THEN 1 ELSE 0 END
                 WHERE food_id = ?`,
                [cItem.quantity, cItem.food_id]
            );
        }
        await connection.commit();

        res.json({
            message: 'Order cancelled successfully'
        });

    } catch (error) {
        await connection.rollback();
        console.error('Cancel order error:', error);
        res.status(500).json({
            error: 'Failed to cancel order',
            message: error.message
        });
    } finally {
        connection.release();
    }
});

module.exports = router;

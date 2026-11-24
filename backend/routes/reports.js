const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const db = require('../config/database');

// Get sales report
router.get('/sales', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        let query = 'SELECT * FROM sales_report';
        const params = [];

        if (start_date) {
            query += ' WHERE sale_date >= ?';
            params.push(start_date);
        }

        if (end_date) {
            if (params.length > 0) {
                query += ' AND sale_date <= ?';
            } else {
                query += ' WHERE sale_date <= ?';
            }
            params.push(end_date);
        }

        query += ' ORDER BY sale_date DESC';

        const [sales] = await db.promisePool.query(query, params);

        res.json({ sales });

    } catch (error) {
        console.error('Get sales report error:', error);
        res.status(500).json({
            error: 'Failed to fetch sales report',
            message: error.message
        });
    }
});

// Get popular items report
router.get('/popular-items', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const [items] = await db.promisePool.query(
            'SELECT * FROM popular_items LIMIT ?',
            [parseInt(limit, 10) || 10]
        );

        res.json({ items });

    } catch (error) {
        console.error('Get popular items error:', error);
        res.status(500).json({
            error: 'Failed to fetch popular items',
            message: error.message
        });
    }
});

// Get customer orders report
router.get('/customers', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [customers] = await db.promisePool.query(
            'SELECT * FROM customer_orders'
        );

        res.json({ customers });

    } catch (error) {
        console.error('Get customer report error:', error);
        res.status(500).json({
            error: 'Failed to fetch customer report',
            message: error.message
        });
    }
});

// Get delivery performance report
router.get('/delivery-performance', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [performance] = await db.promisePool.query(
            'SELECT * FROM delivery_performance'
        );

        res.json({ performance });

    } catch (error) {
        console.error('Get delivery performance error:', error);
        res.status(500).json({
            error: 'Failed to fetch delivery performance',
            message: error.message
        });
    }
});

// Get dashboard statistics
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // Get order statistics
        const [orderStats] = await db.promisePool.query(
            `
            SELECT
                COUNT(*) as total_orders,
                SUM(CASE WHEN order_status = 'Pending' THEN 1 ELSE 0 END) as pending_orders,
                SUM(CASE WHEN order_status = 'Preparing' THEN 1 ELSE 0 END) as preparing_orders,
                SUM(CASE WHEN order_status = 'Out for Delivery' THEN 1 ELSE 0 END) as out_for_delivery,
                SUM(CASE WHEN order_status = 'Delivered' THEN 1 ELSE 0 END) as delivered_orders,
                SUM(CASE WHEN order_status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
                SUM(total_amount) as total_sales
            FROM orders
            `
        );

        // Get user statistics
        const [userStats] = await db.promisePool.query(
            `
            SELECT
                COUNT(*) as total_users,
                SUM(CASE WHEN role = 'customer' THEN 1 ELSE 0 END) as customers,
                SUM(CASE WHEN role = 'delivery' THEN 1 ELSE 0 END) as delivery_personnel,
                SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins
            FROM users
            `
        );

        // Get food statistics
        const [foodStats] = await db.promisePool.query(
            `
            SELECT
                COUNT(*) as total_food_items,
                SUM(CASE WHEN availability = 1 THEN 1 ELSE 0 END) as available_items,
                SUM(stock_quantity) as total_stock
            FROM food
            `
        );

        // Get today's statistics
        const [todayStats] = await db.promisePool.query(
            `
            SELECT
                COUNT(*) as today_orders,
                SUM(total_amount) as today_sales
            FROM orders
            WHERE DATE(order_date) = CURDATE()
            `
        );

        // Get this month's statistics
        const [monthStats] = await db.promisePool.query(
            `
            SELECT
                COUNT(*) as month_orders,
                SUM(total_amount) as month_sales
            FROM orders
            WHERE YEAR(order_date) = YEAR(CURDATE()) AND MONTH(order_date) = MONTH(CURDATE())
            `
        );

        res.json({
            orders: orderStats[0],
            users: userStats[0],
            food: foodStats[0],
            today: todayStats[0],
            month: monthStats[0]
        });

    } catch (error) {
        console.error('Get dashboard statistics error:', error);
        res.status(500).json({
            error: 'Failed to fetch dashboard statistics',
            message: error.message
        });
    }
});

// Get revenue by category
router.get('/revenue-by-category', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        let query = `
            SELECT
                f.category,
                SUM(oi.quantity) as total_items,
                SUM(oi.subtotal) as total_revenue
            FROM order_items oi
            JOIN food f ON oi.food_id = f.food_id
            JOIN orders o ON oi.order_id = o.order_id
            WHERE o.order_status != 'Cancelled'
        `;
        const params = [];

        if (start_date) {
            query += ' AND DATE(o.order_date) >= ?';
            params.push(start_date);
        }

        if (end_date) {
            query += ' AND DATE(o.order_date) <= ?';
            params.push(end_date);
        }

        query += ' GROUP BY f.category ORDER BY total_revenue DESC';

        const [revenue] = await db.promisePool.query(query, params);

        res.json({ revenue });

    } catch (error) {
        console.error('Get revenue by category error:', error);
        res.status(500).json({
            error: 'Failed to fetch revenue by category',
            message: error.message
        });
    }
});

// Get hourly order distribution
router.get('/hourly-orders', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { date } = req.query;

        let query = `
            SELECT
                HOUR(order_date) as hour,
                COUNT(*) as order_count
            FROM orders
        `;
        const params = [];

        if (date) {
            query += ' WHERE DATE(order_date) = ?';
            params.push(date);
        } else {
            query += ' WHERE DATE(order_date) = CURDATE()';
        }

        query += ' GROUP BY HOUR(order_date) ORDER BY hour ASC';

        const [hourly] = await db.promisePool.query(query, params);

        res.json({ hourly });

    } catch (error) {
        console.error('Get hourly orders error:', error);
        res.status(500).json({
            error: 'Failed to fetch hourly orders',
            message: error.message
        });
    }
});

module.exports = router;

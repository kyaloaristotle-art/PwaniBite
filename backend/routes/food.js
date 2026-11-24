const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const db = require('../config/database');

// Get all food items
router.get('/', async (req, res) => {
    try {
        const { category, available } = req.query;

        let query = 'SELECT * FROM food';
        const params = [];

        if (category) {
            query += ' WHERE category = ?';
            params.push(category);
        }

        if (available !== undefined) {
            if (params.length > 0) {
                query += ' AND availability = ?';
            } else {
                query += ' WHERE availability = ?';
            }
            params.push(available === 'true');
        }

        query += ' ORDER BY food_name ASC';

        const [food] = await db.promisePool.query(query, params);

        res.json({ food });

    } catch (error) {
        console.error('Get food error:', error);
        res.status(500).json({
            error: 'Failed to fetch food items',
            message: error.message
        });
    }
});

// Get food by ID
router.get('/:id', async (req, res) => {
    try {
        const [food] = await db.promisePool.query(
            'SELECT * FROM food WHERE food_id = ?',
            [req.params.id]
        );

        if (food.length === 0) {
            return res.status(404).json({
                error: 'Food item not found'
            });
        }

        res.json({ food: food[0] });

    } catch (error) {
        console.error('Get food error:', error);
        res.status(500).json({
            error: 'Failed to fetch food item',
            message: error.message
        });
    }
});

// Add new food item (admin only)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { food_name, description, price, category, availability, stock_quantity } = req.body;

        const [result] = await db.promisePool.query(
            'INSERT INTO food (food_name, description, price, category, availability, stock_quantity) VALUES (?, ?, ?, ?, ?, ?)',
            [food_name, description, price, category, availability !== undefined ? availability : true, stock_quantity || 0]
        );

        res.status(201).json({
            message: 'Food item added successfully',
            food_id: result.insertId
        });

    } catch (error) {
        console.error('Add food error:', error);
        res.status(500).json({
            error: 'Failed to add food item',
            message: error.message
        });
    }
});

// Update food item (admin only)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { food_name, description, price, category, availability, stock_quantity } = req.body;

        const [result] = await db.promisePool.query(
            'UPDATE food SET food_name = ?, description = ?, price = ?, category = ?, availability = ?, stock_quantity = ? WHERE food_id = ?',
            [food_name, description, price, category, availability, stock_quantity, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: 'Food item not found'
            });
        }

        res.json({
            message: 'Food item updated successfully'
        });

    } catch (error) {
        console.error('Update food error:', error);
        res.status(500).json({
            error: 'Failed to update food item',
            message: error.message
        });
    }
});

// Delete food item (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [result] = await db.promisePool.query(
            'DELETE FROM food WHERE food_id = ?',
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: 'Food item not found'
            });
        }

        res.json({
            message: 'Food item deleted successfully'
        });

    } catch (error) {
        console.error('Delete food error:', error);
        res.status(500).json({
            error: 'Failed to delete food item',
            message: error.message
        });
    }
});

// Get food categories
router.get('/categories/list', async (req, res) => {
    try {
        const [categories] = await db.promisePool.query(
            'SELECT DISTINCT category FROM food ORDER BY category ASC'
        );

        res.json({
            categories: categories.map(c => c.category)
        });

    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({
            error: 'Failed to fetch categories',
            message: error.message
        });
    }
});

module.exports = router;

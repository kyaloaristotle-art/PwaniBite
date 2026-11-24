const express = require('express');
const router = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const db = require('../config/database');

// Get all users (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [users] = await db.promisePool.query(
            'SELECT user_id, name, email, phone, role, hostel, block, room, created_at FROM users ORDER BY created_at DESC'
        );

        res.json({ users });

    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            error: 'Failed to fetch users',
            message: error.message
        });
    }
});

// Get user by ID (admin only)
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [users] = await db.promisePool.query(
            'SELECT user_id, name, email, phone, role, hostel, block, room, created_at FROM users WHERE user_id = ?',
            [req.params.id]
        );

        if (users.length === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        res.json({ user: users[0] });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            error: 'Failed to fetch user',
            message: error.message
        });
    }
});

// Update user (admin only)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, email, phone, role, hostel, block, room } = req.body;

        const [result] = await db.promisePool.query(
            'UPDATE users SET name = ?, email = ?, phone = ?, role = ?, hostel = ?, block = ?, room = ? WHERE user_id = ?',
            [name, email, phone, role, hostel, block, room, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        res.json({
            message: 'User updated successfully'
        });

    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            error: 'Failed to update user',
            message: error.message
        });
    }
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [result] = await db.promisePool.query(
            'DELETE FROM users WHERE user_id = ?',
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                error: 'User not found'
            });
        }

        res.json({
            message: 'User deleted successfully'
        });

    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            error: 'Failed to delete user',
            message: error.message
        });
    }
});

// Get delivery personnel (admin only)
router.get('/delivery/list', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [users] = await db.promisePool.query(
            'SELECT user_id, name, email, phone FROM users WHERE role = ? ORDER BY name ASC',
            ['delivery']
        );

        res.json({ users });

    } catch (error) {
        console.error('Get delivery personnel error:', error);
        res.status(500).json({
            error: 'Failed to fetch delivery personnel',
            message: error.message
        });
    }
});

module.exports = router;

// Authentication routes for Pour Choices MVP
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const db = require('../database/connection');

// Validation schemas
const signupSchema = Joi.object({
    username: Joi.string().alphanum().min(3).max(20).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^\+1 \(\d{3}\) \d{3}-\d{4}$/).optional(),
    profilePic: Joi.string().optional(),
    addToHome: Joi.boolean().optional(),
    stayLoggedIn: Joi.boolean().optional()
});

const loginSchema = Joi.object({
    email: Joi.string().email().required()
});

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
    try {
        const { error, value } = signupSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { username, email, phone, profilePic, addToHome, stayLoggedIn } = value;

        // Check if user already exists
        const existingUser = await db.query(
            'SELECT id FROM users WHERE email = $1 OR username = $2',
            [email, username]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ 
                error: 'User already exists',
                duplicate: true
            });
        }

        // Create user
        const toggles = {
            addToHome: addToHome || false,
            stayLoggedIn: stayLoggedIn || false
        };

        const result = await db.query(
            `INSERT INTO users (username, email, phone, profile_pic_url, toggles) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id, username, email, profile_pic_url, toggles, created_at`,
            [username, email, phone, profilePic, JSON.stringify(toggles)]
        );

        const user = result.rows[0];

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET || 'dev-secret',
            { expiresIn: stayLoggedIn ? '30d' : '7d' }
        );

        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                profilePic: user.profile_pic_url,
                toggles: JSON.parse(user.toggles)
            },
            token
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { error, value } = loginSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { email } = value;

        // Find user
        const result = await db.query(
            'SELECT id, username, email, profile_pic_url, toggles FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];
        const toggles = JSON.parse(user.toggles);

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET || 'dev-secret',
            { expiresIn: toggles.stayLoggedIn ? '30d' : '7d' }
        );

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                profilePic: user.profile_pic_url,
                toggles
            },
            token
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/auth/verify
router.get('/verify', authenticateToken, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT id, username, email, profile_pic_url, toggles FROM users WHERE id = $1',
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];

        res.json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                profilePic: user.profile_pic_url,
                toggles: JSON.parse(user.toggles)
            }
        });

    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'dev-secret', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

module.exports = router;

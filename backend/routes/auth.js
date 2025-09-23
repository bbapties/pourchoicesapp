// Authentication routes for Pour Choices MVP
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const supabase = require('../database/connection');

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
        const { data: existingUser, error: userError } = await supabase
            .from('users')
            .select('id')
            .or(`email.eq.${email},username.eq.${username}`)
            .maybeSingle();

        if (userError) {
            console.error('User check error:', userError);
            return res.status(500).json({ error: 'Database error' });
        }

        if (existingUser) {
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

        const { data: user, error: insertError } = await supabase
            .from('users')
            .insert({
                username,
                email,
                phone,
                profile_pic_url: profilePic,
                toggles: JSON.stringify(toggles)
            })
            .select('id, username, email, profile_pic_url, toggles, created_at')
            .single();

        if (insertError) {
            console.error('Signup insert error:', insertError);
            return res.status(500).json({ error: 'Failed to create user' });
        }

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
        const { data: user, error: loginError } = await supabase
            .from('users')
            .select('id, username, email, profile_pic_url, toggles')
            .eq('email', email)
            .maybeSingle();

        if (loginError) {
            console.error('Login query error:', loginError);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
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
        const { data: user, error: verifyError } = await supabase
            .from('users')
            .select('id, username, email, profile_pic_url, toggles')
            .eq('id', req.user.userId)
            .maybeSingle();

        if (verifyError) {
            console.error('Verify query error:', verifyError);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

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

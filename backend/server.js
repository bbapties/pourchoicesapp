// Pour Choices MVP Backend Server
// Version: 2.0 | Date: September 17, 2025

require('dotenv').config();
console.log('dotenv loaded', process.env.SUPABASE_URL);

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
    origin: true, // reflect the request origin for development
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Serve static files from root directory
app.use(express.static('../'));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/spirits', require('./routes/spirits'));
// TODO: Implement missing routes
// app.use('/api/collections', require('./routes/collections'));
// app.use('/api/tastings', require('./routes/tastings'));
// app.use('/api/analytics', require('./routes/analytics'));
// app.use('/api/ai', require('./routes/ai'));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0'
    });
});

// Database connection test endpoint
app.get('/api/test-db', async (req, res) => {
    try {
        const supabase = require('./database/connection');

        // Test query to check connection
        const { data, error } = await supabase
            .from('users')
            .select('count', { count: 'exact', head: true });

        if (error) {
            throw error;
        }

        res.json({
            status: 'connected',
            message: 'Supabase database connection successful',
            userCount: data,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Database test error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Database connection failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Pour Choices API server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;

// Database connection for Pour Choices MVP
const { Pool } = require('pg');

// Database configuration
const dbConfig = {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'pour_choices',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
};

// Create connection pool
const pool = new Pool(dbConfig);

// Handle pool errors
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

// Test database connection
async function testConnection() {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        console.log('Database connected successfully:', result.rows[0].now);
        client.release();
    } catch (error) {
        console.error('Database connection failed:', error);
        process.exit(1);
    }
}

// Initialize connection (commented out to allow server to start without DB)
// testConnection();

// Export query function for use in routes
const db = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect(),
    end: () => pool.end()
};

module.exports = db;

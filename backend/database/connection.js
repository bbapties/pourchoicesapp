// Database connection for Pour Choices MVP using Supabase
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://lrvraigdihzkgphjdezk.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxydnJhaWdkaWh6a2dwaGpkZXprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1ODg3MTcsImV4cCI6MjA3MjE2NDcxN30.C7f1DJh-BDkkwIKmV-RaZ-NJA7LHEacSoNtoY_sgSDE';

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// Test database connection
async function testConnection() {
    try {
        const { data, error } = await supabase.from('users').select('count', { count: 'exact', head: true });
        if (error) throw error;
        console.log('Supabase database connected successfully');
    } catch (error) {
        console.error('Supabase connection failed:', error.message);
        // Don't exit for production - handle gracefully
        if (process.env.NODE_ENV === 'production') {
            console.warn('Continuing without DB connection...');
        } else {
            process.exit(1);
        }
    }
}

// Initialize connection
testConnection();

// Export Supabase client for use in routes
module.exports = supabase;

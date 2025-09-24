-- Pour Choices MVP Database Schema
-- Version: 2.0 | Date: September 17, 2025

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    profile_pic_url TEXT,
    phone VARCHAR(25),
    toggles JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Spirits/Bottles table
CREATE TABLE spirits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    distillery VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    barcode VARCHAR(50),
    images JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('approved', 'pending', 'rejected')),
    added_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User collections table
CREATE TABLE user_collections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    bottle_id UUID REFERENCES spirits(id) ON DELETE CASCADE,
    volume INTEGER DEFAULT 100 CHECK (volume >= 0 AND volume <= 100),
    number_owned INTEGER DEFAULT 1 CHECK (number_owned >= 0 AND number_owned <= 999),
    notes TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    added_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, bottle_id)
);

-- Tastings table
CREATE TABLE tastings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    bottles JSONB NOT NULL, -- Array of bottle IDs
    assignments JSONB NOT NULL, -- Map of slot (A-E) to bottle_id
    notes JSONB DEFAULT '{}', -- {slot: {nose: {flavors: [], custom: ''}, taste: {}, finish: {}}}
    ranks JSONB DEFAULT '{}', -- {slot: rank_number}
    is_draft BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Bottle ratings (Elo system)
CREATE TABLE bottle_ratings (
    bottle_id UUID REFERENCES spirits(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    elo_raw FLOAT DEFAULT 1500,
    global_elo FLOAT DEFAULT 1500,
    tasting_count INTEGER DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (bottle_id, user_id)
);

-- Flavor list of values (for monitoring recurring custom notes)
CREATE TABLE flavor_lov (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    flavor TEXT UNIQUE NOT NULL,
    occurrences INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pending adds (for admin review)
CREATE TABLE pending_adds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    bottle_id UUID REFERENCES spirits(id) ON DELETE CASCADE,
    confidence FLOAT,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by UUID REFERENCES users(id)
);

-- Analytics events (for UX optimization)
CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(100),
    screen VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    data JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    device_info JSONB DEFAULT '{}'
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_spirits_name ON spirits(name);
CREATE INDEX idx_spirits_distillery ON spirits(distillery);
CREATE INDEX idx_spirits_type ON spirits(type);
CREATE INDEX idx_spirits_status ON spirits(status);
CREATE INDEX idx_user_collections_user_id ON user_collections(user_id);
CREATE INDEX idx_user_collections_bottle_id ON user_collections(bottle_id);
CREATE INDEX idx_tastings_user_id ON tastings(user_id);
CREATE INDEX idx_tastings_created_at ON tastings(created_at);
CREATE INDEX idx_bottle_ratings_user_id ON bottle_ratings(user_id);
CREATE INDEX idx_bottle_ratings_bottle_id ON bottle_ratings(bottle_id);
CREATE INDEX idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX idx_analytics_events_timestamp ON analytics_events(timestamp);
CREATE INDEX idx_analytics_events_screen_action ON analytics_events(screen, action);

-- Full-text search index for spirits
CREATE INDEX idx_spirits_search ON spirits USING gin(to_tsvector('english', name || ' ' || distillery || ' ' || type));

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_spirits_updated_at BEFORE UPDATE ON spirits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_collections_updated_at BEFORE UPDATE ON user_collections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample data for development
INSERT INTO users (username, email, profile_pic_url) VALUES 
('WhiskeyFan123', 'demo@pourchoices.com', 'whiskey-glass'),
('TastingMaster', 'master@pourchoices.com', 'oak-barrel');

INSERT INTO spirits (name, distillery, type, status, added_by) VALUES 
('Glenfiddich 12', 'Glenfiddich Distillery', 'Single Malt', 'approved', (SELECT id FROM users WHERE username = 'WhiskeyFan123')),
('Macallan 18', 'Macallan Distillery', 'Single Malt', 'approved', (SELECT id FROM users WHERE username = 'WhiskeyFan123')),
('Woodford Reserve', 'Woodford Reserve Distillery', 'Bourbon', 'approved', (SELECT id FROM users WHERE username = 'TastingMaster')),
('Johnnie Walker Black', 'Johnnie Walker', 'Blended', 'approved', (SELECT id FROM users WHERE username = 'TastingMaster')),
('Buffalo Trace', 'Buffalo Trace Distillery', 'Bourbon', 'approved', (SELECT id FROM users WHERE username = 'WhiskeyFan123'));

INSERT INTO flavor_lov (flavor) VALUES 
('Oak'), ('Vanilla'), ('Smoke'), ('Citrus'), ('Caramel'), ('Honey'), ('Spice'), ('Fruit'),
('Chocolate'), ('Coffee'), ('Nutty'), ('Floral'), ('Herbal'), ('Peaty'), ('Sweet'),
('Bitter'), ('Smooth'), ('Sharp'), ('Rich'), ('Light'), ('Bold'), ('Complex'), ('Simple');

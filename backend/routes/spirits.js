// Spirits/Bottles routes for Pour Choices MVP
const express = require('express');
const router = express.Router();
const Joi = require('joi');
const db = require('../database/connection');

// Validation schemas
const searchSchema = Joi.object({
    query: Joi.string().min(1).max(100).required(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(20)
});

const addBottleSchema = Joi.object({
    name: Joi.string().min(1).max(100).required(),
    distillery: Joi.string().min(1).max(100).required(),
    type: Joi.string().min(1).max(50).required(),
    barcode: Joi.string().max(50).optional(),
    images: Joi.array().items(Joi.string().uri()).optional()
});

const filterSchema = Joi.object({
    name: Joi.string().max(100).optional(),
    distillery: Joi.string().max(100).optional(),
    type: Joi.string().max(50).optional(),
    yourRankMin: Joi.number().min(0).max(100).default(0),
    yourRankMax: Joi.number().min(0).max(100).default(100),
    globalRankMin: Joi.number().min(0).max(100).default(0),
    globalRankMax: Joi.number().min(0).max(100).default(100),
    sort: Joi.string().valid('your', 'global').default('your'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(20)
});

// GET /api/spirits/search
router.get('/search', async (req, res) => {
    try {
        const { error, value } = searchSchema.validate(req.query);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { query, page, limit } = value;
        const offset = (page - 1) * limit;

        // Full-text search with ranking
        const result = await db.query(`
            SELECT 
                s.id,
                s.name,
                s.distillery,
                s.type,
                s.images,
                s.status,
                ts_rank(to_tsvector('english', s.name || ' ' || s.distillery || ' ' || s.type), 
                       plainto_tsquery('english', $1)) as rank
            FROM spirits s
            WHERE to_tsvector('english', s.name || ' ' || s.distillery || ' ' || s.type) 
                  @@ plainto_tsquery('english', $1)
            AND s.status = 'approved'
            ORDER BY rank DESC, s.name ASC
            LIMIT $2 OFFSET $3
        `, [query, limit, offset]);

        // Get total count
        const countResult = await db.query(`
            SELECT COUNT(*) as total
            FROM spirits s
            WHERE to_tsvector('english', s.name || ' ' || s.distillery || ' ' || s.type) 
                  @@ plainto_tsquery('english', $1)
            AND s.status = 'approved'
        `, [query]);

        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);

        res.json({
            results: result.rows.map(row => ({
                id: row.id,
                name: row.name,
                distillery: row.distillery,
                type: row.type,
                images: JSON.parse(row.images || '[]'),
                status: row.status,
                emoji: getBottleEmoji(row.type)
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }
        });

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/spirits/:id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(`
            SELECT 
                s.*,
                br.elo_raw as user_ranking,
                br.global_elo as global_ranking
            FROM spirits s
            LEFT JOIN bottle_ratings br ON s.id = br.bottle_id AND br.user_id = $2
            WHERE s.id = $1 AND s.status = 'approved'
        `, [id, req.user?.userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Bottle not found' });
        }

        const bottle = result.rows[0];
        const userRank = bottle.user_ranking ? Math.round(calculatePercentile(bottle.user_ranking)) : 50;
        const globalRank = bottle.global_ranking ? Math.round(calculatePercentile(bottle.global_ranking)) : 50;

        res.json({
            id: bottle.id,
            name: bottle.name,
            distillery: bottle.distillery,
            type: bottle.type,
            barcode: bottle.barcode,
            images: JSON.parse(bottle.images || '[]'),
            status: bottle.status,
            emoji: getBottleEmoji(bottle.type),
            rankings: {
                your: userRank,
                global: globalRank
            }
        });

    } catch (error) {
        console.error('Get bottle error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/spirits
router.post('/', async (req, res) => {
    try {
        const { error, value } = addBottleSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { name, distillery, type, barcode, images } = value;

        // Check for duplicates using similarity
        const duplicateCheck = await db.query(`
            SELECT id, name, distillery, similarity(name || ' ' || distillery, $1 || ' ' || $2) as sim
            FROM spirits 
            WHERE similarity(name || ' ' || distillery, $1 || ' ' || $2) > 0.8
        `, [name, distillery]);

        if (duplicateCheck.rows.length > 0) {
            return res.status(409).json({
                error: 'Similar bottle already exists',
                duplicates: duplicateCheck.rows.map(row => ({
                    id: row.id,
                    name: row.name,
                    distillery: row.distillery,
                    similarity: row.sim
                }))
            });
        }

        // Create new bottle
        const result = await db.query(`
            INSERT INTO spirits (name, distillery, type, barcode, images, added_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, name, distillery, type, status, created_at
        `, [name, distillery, type, barcode, JSON.stringify(images || []), req.user?.userId]);

        const bottle = result.rows[0];

        res.status(201).json({
            message: 'Bottle added successfully',
            bottle: {
                id: bottle.id,
                name: bottle.name,
                distillery: bottle.distillery,
                type: bottle.type,
                status: bottle.status,
                emoji: getBottleEmoji(bottle.type)
            }
        });

    } catch (error) {
        console.error('Add bottle error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/spirits/filter
router.get('/filter', async (req, res) => {
    try {
        const { error, value } = filterSchema.validate(req.query);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { name, distillery, type, yourRankMin, yourRankMax, globalRankMin, globalRankMax, sort, page, limit } = value;
        const offset = (page - 1) * limit;

        // Build dynamic query
        let whereConditions = ["s.status = 'approved'"];
        let queryParams = [];
        let paramIndex = 1;

        if (name) {
            whereConditions.push(`s.name ILIKE $${paramIndex}`);
            queryParams.push(`%${name}%`);
            paramIndex++;
        }

        if (distillery) {
            whereConditions.push(`s.distillery ILIKE $${paramIndex}`);
            queryParams.push(`%${distillery}%`);
            paramIndex++;
        }

        if (type) {
            whereConditions.push(`s.type = $${paramIndex}`);
            queryParams.push(type);
            paramIndex++;
        }

        // Add ranking filters
        if (req.user?.userId) {
            whereConditions.push(`(br.elo_raw IS NULL OR (br.elo_raw >= $${paramIndex} AND br.elo_raw <= $${paramIndex + 1}))`);
            queryParams.push(yourRankMin, yourRankMax);
            paramIndex += 2;
        }

        whereConditions.push(`(br_global.global_elo IS NULL OR (br_global.global_elo >= $${paramIndex} AND br_global.global_elo <= $${paramIndex + 1}))`);
        queryParams.push(globalRankMin, globalRankMax);
        paramIndex += 2;

        // Add pagination params
        queryParams.push(limit, offset);

        const query = `
            SELECT 
                s.id,
                s.name,
                s.distillery,
                s.type,
                s.images,
                s.status,
                br.elo_raw as user_ranking,
                br_global.global_elo as global_ranking
            FROM spirits s
            LEFT JOIN bottle_ratings br ON s.id = br.bottle_id AND br.user_id = $${paramIndex + 1}
            LEFT JOIN (
                SELECT bottle_id, AVG(global_elo) as global_elo
                FROM bottle_ratings
                GROUP BY bottle_id
            ) br_global ON s.id = br_global.bottle_id
            WHERE ${whereConditions.join(' AND ')}
            ORDER BY ${sort === 'your' ? 'br.elo_raw DESC NULLS LAST' : 'br_global.global_elo DESC NULLS LAST'}, s.name ASC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        // Add user_id to params for the LEFT JOIN
        queryParams.push(req.user?.userId);

        const result = await db.query(query, queryParams);

        res.json({
            results: result.rows.map(row => ({
                id: row.id,
                name: row.name,
                distillery: row.distillery,
                type: row.type,
                images: JSON.parse(row.images || '[]'),
                status: row.status,
                emoji: getBottleEmoji(row.type),
                rankings: {
                    your: row.user_ranking ? Math.round(calculatePercentile(row.user_ranking)) : 50,
                    global: row.global_ranking ? Math.round(calculatePercentile(row.global_ranking)) : 50
                }
            }))
        });

    } catch (error) {
        console.error('Filter error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper functions
function getBottleEmoji(type) {
    const emojis = {
        'Blended': '🥃',
        'Bourbon': '🥃',
        'Single Malt': '🥃',
        'Rye': '🌾',
        'Other': '🍺'
    };
    return emojis[type] || '🥃';
}

function calculatePercentile(elo) {
    // Convert Elo rating to 0-100 percentile
    // This is a simplified calculation - in production, you'd use actual percentile calculation
    const minElo = 1000;
    const maxElo = 2000;
    const normalized = Math.max(0, Math.min(100, ((elo - minElo) / (maxElo - minElo)) * 100));
    return normalized;
}

module.exports = router;

// Spirits/Bottles routes for Pour Choices MVP
const express = require('express');
const router = express.Router();
const Joi = require('joi');
const supabase = require('../database/connection');
const levenshtein = require('fast-levenshtein');

// Validation schemas
const searchSchema = Joi.object({
    query: Joi.string().max(100).allow('').default(''),
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
        console.log('Search validation:', req.query, error, value);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { query, page, limit } = value;
        const offset = (page - 1) * limit;

        // If no query, get all bottles sorted by newest first
        let supabaseQuery = supabase
            .from('spirits')
            .select('id, name, distillery, type, images, status', { count: 'exact' })
            .eq('status', 'approved');

        if (query && query.trim()) {
            // Search using ILIKE for name and distillery, exact match for type
            supabaseQuery = supabaseQuery
                .or(`name.ilike.%${query}%,distillery.ilike.%${query}%,type.ilike.%${query}%`);
        }

        supabaseQuery = supabaseQuery
            .range(offset, offset + limit - 1)
            .order('created_at', { ascending: false }); // Newest first

        const { data: results, error: searchError, count } = await supabaseQuery;

        if (searchError) {
            console.error('Search error:', searchError);
            return res.status(500).json({ error: 'Database error' });
        }

        const total = count;
        const totalPages = Math.ceil(total / limit);

        res.json({
            results: results.map(row => ({
                id: row.id,
                name: row.name,
                distillery: row.distillery,
                type: row.type,
                images: row.images || [],
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

        // Get bottle details
        const { data: bottle, error: bottleError } = await supabase
            .from('spirits')
            .select('*')
            .eq('id', id)
            .eq('status', 'approved')
            .maybeSingle();

        if (bottleError) {
            console.error('Bottle query error:', bottleError);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!bottle) {
            return res.status(404).json({ error: 'Bottle not found' });
        }

        let userRank = 50;
        let globalRank = 50;

        if (req.user?.userId) {
            // Get user-specific rating
            const { data: userRating, error: userRatingError } = await supabase
                .from('bottle_ratings')
                .select('elo_raw, global_elo')
                .eq('bottle_id', id)
                .eq('user_id', req.user.userId)
                .maybeSingle();

            if (userRatingError) {
                console.error('User rating query error:', userRatingError);
            } else if (userRating) {
                userRank = Math.round(calculatePercentile(userRating.elo_raw));
                globalRank = Math.round(calculatePercentile(userRating.global_elo));
            }
        } else {
            // Get global average rating
            const { data: globalRating, error: globalRatingError } = await supabase
                .from('bottle_ratings')
                .select('global_elo')
                .eq('bottle_id', id);

            if (globalRatingError) {
                console.error('Global rating query error:', globalRatingError);
            } else if (globalRating.length > 0) {
                const avgGlobalElo = globalRating.reduce((sum, r) => sum + r.global_elo, 0) / globalRating.length;
                globalRank = Math.round(calculatePercentile(avgGlobalElo));
            }
        }

        res.json({
            id: bottle.id,
            name: bottle.name,
            distillery: bottle.distillery,
            type: bottle.type,
            barcode: bottle.barcode,
            images: bottle.images || [],
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

        // Check for duplicates using Levenshtein similarity
        const newCombined = `${name} ${distillery}`.toLowerCase();
        const { data: existingBottles, error: duplicateError } = await supabase
            .from('spirits')
            .select('id, name, distillery')
            .eq('status', 'approved'); // Only check against approved bottles

        if (duplicateError) {
            console.error('Duplicate check error:', duplicateError);
            return res.status(500).json({ error: 'Database error' });
        }

        const duplicates = [];
        if (existingBottles && existingBottles.length > 0) {
            existingBottles.forEach(bottle => {
                const existingCombined = `${bottle.name} ${bottle.distillery}`.toLowerCase();
                const distance = levenshtein.get(newCombined, existingCombined);
                const maxLength = Math.max(newCombined.length, existingCombined.length);
                const similarity = maxLength > 0 ? 1 - (distance / maxLength) : 0;

                // If similarity >= 80%, consider it a duplicate
                if (similarity >= 0.8) {
                    duplicates.push({ id: bottle.id, name: bottle.name, distillery: bottle.distillery, similarity });
                }
            });
        }

        if (duplicates.length > 0) {
            return res.status(409).json({
                error: 'Similar bottle already exists',
                explain: 'Admin will review this addition',
                duplicates: duplicates.map(d => ({ id: d.id, name: d.name, distillery: d.distillery }))
            });
        }

        // Create new bottle
        const { data: bottle, error: insertError } = await supabase
            .from('spirits')
            .insert({
                name,
                distillery,
                type,
                barcode,
                images: images || [],
                added_by: req.user?.userId
            })
            .select('id, name, distillery, type, status, created_at')
            .single();

        if (insertError) {
            console.error('Add bottle insert error:', insertError);
            return res.status(500).json({ error: 'Failed to create bottle' });
        }

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

        // First, get all bottles with basic filtering (but no rating filters yet)
        let spiritsQuery = supabase
            .from('spirits')
            .select('id, name, distillery, type, images, status')
            .eq('status', 'approved');

        if (name) {
            spiritsQuery = spiritsQuery.ilike('name', `%${name}%`);
        }
        if (distillery) {
            spiritsQuery = spiritsQuery.ilike('distillery', `%${distillery}%`);
        }
        if (type) {
            spiritsQuery = spiritsQuery.ilike('type', `%${type}%`);
        }

        const { data: allSpirits, error: spiritsError } = await spiritsQuery;

        if (spiritsError) {
            console.error('Spirits query error:', spiritsError);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!allSpirits || allSpirits.length === 0) {
            return res.json({ results: [] });
        }

        // Get ratings for these bottles
        const bottleIds = allSpirits.map(s => s.id);

        let ratingsData = {};
        let globalRatingsData = {};

        // Get user ratings if authenticated
        if (req.user?.userId) {
            const { data: userRatings, error: userRatingsError } = await supabase
                .from('bottle_ratings')
                .select('bottle_id, elo_raw, global_elo')
                .in('bottle_id', bottleIds)
                .eq('user_id', req.user.userId);

            if (!userRatingsError && userRatings) {
                userRatings.forEach(rating => {
                    ratingsData[rating.bottle_id] = rating;
                });
            }
        }

        // Get global ratings (average)
        const { data: allGlobalRatings, error: globalRatingsError } = await supabase
            .from('bottle_ratings')
            .select('bottle_id, global_elo')
            .in('bottle_id', bottleIds);

        if (!globalRatingsError && allGlobalRatings) {
            const globalRatingMap = {};
            allGlobalRatings.forEach(rating => {
                if (!globalRatingMap[rating.bottle_id]) {
                    globalRatingMap[rating.bottle_id] = [];
                }
                globalRatingMap[rating.bottle_id].push(rating.global_elo);
            });

            Object.keys(globalRatingMap).forEach(bottleId => {
                const ratings = globalRatingMap[bottleId];
                const avgGlobalElo = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
                globalRatingsData[bottleId] = avgGlobalElo;
            });
        }

        // Filter by ratings and build results
        let filteredResults = allSpirits.map(spirit => {
            const userRating = ratingsData[spirit.id];
            const globalAvg = globalRatingsData[spirit.id];

            const userRank = userRating ? Math.round(calculatePercentile(userRating.elo_raw)) : 50;
            const globalRank = globalAvg ? Math.round(calculatePercentile(globalAvg)) : 50;

            // Apply rating filters
            if (req.user?.userId && (userRank < yourRankMin || userRank > yourRankMax)) {
                return null;
            }
            if (globalRank < globalRankMin || globalRank > globalRankMax) {
                return null;
            }

            return {
                id: spirit.id,
                name: spirit.name,
                distillery: spirit.distillery,
                type: spirit.type,
                images: spirit.images || [],
                status: spirit.status,
                emoji: getBottleEmoji(spirit.type),
                rankings: {
                    your: userRank,
                    global: globalRank
                }
            };
        }).filter(result => result !== null);

        // Sort results
        if (sort === 'your' && req.user?.userId) {
            filteredResults.sort((a, b) => b.rankings.your - a.rankings.your || a.name.localeCompare(b.name));
        } else {
            filteredResults.sort((a, b) => b.rankings.global - a.rankings.global || a.name.localeCompare(b.name));
        }

        // Apply pagination
        const offset = (page - 1) * limit;
        const paginatedResults = filteredResults.slice(offset, offset + limit);

        // For simplicity, return results without detailed pagination stats
        res.json({
            results: paginatedResults
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

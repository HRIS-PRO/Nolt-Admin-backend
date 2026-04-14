import { Router } from 'express';
import pool from '../config/db.js';
import { getIO } from '../socket.js';

const router = Router();

// Middleware to ensure user is authenticated staff
const isStaff = (req: any, res: any, next: any) => {
    if (req.isAuthenticated() && req.user.role !== 'customer') {
        return next();
    }
    return res.status(401).json({ message: "Unauthorized. Staff access required." });
};

// ==========================================
// PUBLIC: Track Click
// ==========================================
router.post('/click', async (req, res) => {
    const { campaignCode } = req.body;
    if (!campaignCode) {
        return res.status(400).json({ message: "Missing campaignCode" });
    }

    try {
        const updateResult = await pool.query(`
            UPDATE promotions
            SET current_redemptions = current_redemptions + 1
            WHERE utm_campaign = $1
            RETURNING *;
        `, [campaignCode]);

        if (updateResult.rows.length > 0) {
            const promo = updateResult.rows[0];
            // Emit socket event for real-time dashboard update
            const io = getIO();
            if (io) {
                io.emit('promotion_click', { utm_campaign: promo.utm_campaign, current_redemptions: promo.current_redemptions });
            }
        }
        res.json({ success: true });
    } catch (error) {
        console.error("Error logging promotion click:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});


// ==========================================
// AUTHENTICATED: Get all promotions
// ==========================================
router.get('/', isStaff, async (req: any, res) => {
    try {
        const result = await pool.query('SELECT * FROM promotions ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching promotions:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// ==========================================
// AUTHENTICATED: Create promotion
// ==========================================
router.post('/', isStaff, async (req: any, res) => {
    const {
        utm_campaign,
        target_product,
        utm_source,
        utm_medium,
        benefit_value, // can be null
        expiry_date, // can be null
        max_redemptions // can be null
    } = req.body;

    if (!utm_campaign || !target_product) {
        return res.status(400).json({ message: "utm_campaign and target_product are required." });
    }

    try {
        // Enforce product types
        const allowedProducts = ['NOLT_RISE', 'NOLT_VAULT', 'NOLT_SURGE', 'ALL_PRODUCTS'];
        if (!allowedProducts.includes(target_product)) {
            return res.status(400).json({ message: "Invalid target_product" });
        }

        const insertResult = await pool.query(`
            INSERT INTO promotions (
                utm_campaign, target_product, utm_source, utm_medium, 
                benefit_value, expiry_date, max_redemptions
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `, [
            utm_campaign,
            target_product,
            utm_source || null,
            utm_medium || null,
            benefit_value || null,
            expiry_date || null,
            max_redemptions || null
        ]);

        res.status(201).json(insertResult.rows[0]);
    } catch (error: any) {
        if (error.code === '23505') {
            return res.status(400).json({ message: "utm_campaign already exists. Please use a unique code." });
        }
        console.error("Error creating promotion:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// ==========================================
// AUTHENTICATED: Delete promotion
// ==========================================
router.delete('/:id', isStaff, async (req: any, res) => {
    try {
        if (req.user.role !== 'super_admin') {
            return res.status(403).json({ message: "Only super admins can delete promotions." });
        }

        const promoId = req.params.id;
        const deleteResult = await pool.query('DELETE FROM promotions WHERE id = $1 RETURNING *', [promoId]);
        
        if (deleteResult.rows.length === 0) {
            return res.status(404).json({ message: "Promotion not found." });
        }

        res.json({ message: "Promotion deleted successfully.", promotion: deleteResult.rows[0] });
    } catch (error) {
        console.error("Error deleting promotion:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// ==========================================
// AUTHENTICATED: Update promotion
// ==========================================
router.put('/:id', isStaff, async (req: any, res) => {
    const { id } = req.params;
    const {
        utm_campaign,
        target_product,
        utm_source,
        utm_medium,
        benefit_value,
        expiry_date,
        max_redemptions
    } = req.body;

    if (!utm_campaign || !target_product) {
        return res.status(400).json({ message: "utm_campaign and target_product are required." });
    }

    try {
        // Enforce product types
        const allowedProducts = ['NOLT_RISE', 'NOLT_VAULT', 'NOLT_SURGE', 'ALL_PRODUCTS'];
        if (!allowedProducts.includes(target_product)) {
            return res.status(400).json({ message: "Invalid target_product" });
        }

        const updateResult = await pool.query(`
            UPDATE promotions 
            SET utm_campaign = $1, 
                target_product = $2, 
                utm_source = $3, 
                utm_medium = $4, 
                benefit_value = $5, 
                expiry_date = $6, 
                max_redemptions = $7,
                updated_at = NOW()
            WHERE id = $8
            RETURNING *;
        `, [
            utm_campaign,
            target_product,
            utm_source || null,
            utm_medium || null,
            benefit_value || null,
            expiry_date || null,
            max_redemptions || null,
            id
        ]);

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ message: "Promotion not found." });
        }

        res.json(updateResult.rows[0]);
    } catch (error: any) {
        if (error.code === '23505') {
            return res.status(400).json({ message: "utm_campaign already exists. Please use a unique code." });
        }
        console.error("Error updating promotion:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;

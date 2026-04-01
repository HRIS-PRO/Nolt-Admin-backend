
import { Router } from 'express';
import { investmentService } from '../services/investmentService.js';
import { paystackService } from '../services/paystackService.js';
import pool from '../config/db.js';

const router = Router();

// Middleware to ensure user is authenticated
const isAuthenticated = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Unauthorized' });
};

/**
 * @swagger
 * /api/investments:
 *   post:
 *     summary: Create a new Investment (Individual or Corporate)
 *     tags: [Investments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               entity_type: { type: string, enum: [INDIVIDUAL, CORPORATE] }
 *               investment_type: { type: string, enum: [NOLT_RISE, NOLT_VAULT, NOLT_SURGE] }
 *               company_name: { type: string }
 *               business_address: { type: string }
 *               rc_number: { type: string }
 *               incorp_date: { type: string, format: date }
 *               tin: { type: string }
 *               business_nature: { type: string }
 *               is_authorized_rep: { type: boolean }
 *               auth_rep_phone: { type: string }
 *               directors: { type: array, items: { type: object } }
 *               rep_full_name: { type: string }
 *               rep_phone_number: { type: string }
 *               rep_bvn: { type: string }
 *               rep_nin: { type: string }
 *               rep_state_of_origin: { type: string }
 *               rep_state_of_residence: { type: string }
 *               rep_house_number: { type: string }
 *               rep_street_address: { type: string }
 *               investment_amount: { type: number }
 *               tenure_days: { type: number }
 *               currency: { type: string, enum: [NGN, USD] }
 *               signatures: { type: array, items: { type: string } }
 *     responses:
 *       201:
 *         description: Investment created
 */
router.post('/', isAuthenticated, async (req: any, res) => {
    try {
        const userId = req.user.id;
        const keys = [
            'investment_type',
            'rep_full_name', 'rep_phone_number',
            'investment_amount', 'tenure_days', 'currency',
            'signatures'
        ];

        // Basic validation
        const missing = keys.filter(k => !req.body[k]);
        if (missing.length > 0) {
            return res.status(400).json({ message: `Missing required fields: ${missing.join(', ')}` });
        }

        // Conditional validation for Corporate
        if (req.body.entity_type === 'CORPORATE') {
            if (!req.body.company_name) return res.status(400).json({ message: "Missing company_name" });
            if (!req.body.business_address) return res.status(400).json({ message: "Missing business_address" });
            if (!req.body.rc_number) return res.status(400).json({ message: "Missing rc_number" });
            if (!req.body.incorp_date) return res.status(400).json({ message: "Missing incorp_date" });
            if (!req.body.directors || req.body.directors.length === 0) return res.status(400).json({ message: "Missing directors" });
        }

        const { giftToken } = req.body;
        const investment = await investmentService.createInvestment(userId, req.body, giftToken);
        res.status(201).json(investment);
    } catch (error: any) {
        console.error("Create Investment Error:", error);
        res.status(500).json({ message: error.message || "Internal server error" });
    }
});

/**
 * @swagger
 * /api/investments:
 *   get:
 *     summary: Get user's investments
 *     tags: [Investments]
 *     responses:
 *       200:
 *         description: List of investments
 */
router.get('/', isAuthenticated, async (req: any, res) => {
    try {
        const userId = req.user.id;
        const investments = await investmentService.getUserInvestments(userId);
        res.json(investments);
    } catch (error: any) {
        console.error("Get Investments Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/investments/latest:
 *   get:
 *     summary: Get the most recent investment for the authenticated customer
 */
router.get('/latest', isAuthenticated, async (req: any, res) => {
    try {
        const result = await pool.query(
            `SELECT i.*, c.email as customer_email 
             FROM investments i
             LEFT JOIN customers c ON i.customer_id = c.id
             WHERE i.customer_id = $1 ORDER BY i.created_at DESC LIMIT 1`,
            [req.user.id]
        );
        res.json(result.rows[0] || null);
    } catch (error: any) {
        console.error("Get Latest Investment Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Move generic parameter route to the end

/**
 * @swagger
 * /api/investments/initialize-gift:
 *   post:
 *     summary: Initialize a Paystack payment for a gift
 */
router.post('/initialize-gift', isAuthenticated, async (req: any, res) => {
    try {
        const { amount, plan, tenure, recipientEmail, currency } = req.body;
        const email = req.user.email;

        const initialization = await paystackService.initializeTransaction(email, amount, {
            type: 'GIFT_INVESTMENT',
            plan,
            tenure,
            recipientEmail,
            currency
        });

        res.json(initialization);
    } catch (error: any) {
        console.error("Initialize Gift Error:", error);
        res.status(500).json({ message: "Failed to initialize payment" });
    }
});

/**
 * @swagger
 * /api/investments/verify-gift:
 *   get:
 *     summary: Verify payment and create gift record
 */
router.get('/verify-gift', isAuthenticated, async (req: any, res) => {
    try {
        const { reference } = req.query;
        console.log(`[Verify Gift] Checking reference: ${reference}`);

        const verification = await paystackService.verifyTransaction(reference as string);
        console.log(`[Verify Gift] Paystack Data Status: ${verification.data?.status}`);

        if (verification.data && verification.data.status === 'success') {
            let metadata = verification.data.metadata;
            if (typeof metadata === 'string') {
                try { metadata = JSON.parse(metadata); } catch (e) { }
            }

            const { plan, tenure, recipientEmail, currency } = metadata || {};
            if (!plan || !recipientEmail) {
                return res.status(400).json({ success: false, message: "Metadata missing" });
            }

            const amount = verification.data.amount / 100;

            // Idempotency: avoid duplicate inserts if user refreshes page
            const existing = await pool.query('SELECT gift_token FROM investment_gifts WHERE payment_reference = $1', [reference]);
            if (existing.rows.length > 0) {
                return res.json({ success: true, token: existing.rows[0].gift_token });
            }

            const query = `
                SELECT interest_rate FROM yield_rates 
                WHERE (plan_name ILIKE '%' || $1 || '%')
                AND currency = $2 
                AND is_active = TRUE
                AND $4 >= min_amount AND (max_amount IS NULL OR $4 <= max_amount)
                ORDER BY ABS(tenure_months - $3) ASC, created_at DESC LIMIT 1;
            `;
            const rateResult = await pool.query(query, [plan, currency, tenure, amount]);
            const interestRate = rateResult.rows[0]?.interest_rate || 0;

            const insertQuery = `
                INSERT INTO investment_gifts (gifter_id, recipient_email, plan_name, amount, tenure_months, currency, interest_rate, payment_reference, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'paid')
                ON CONFLICT (payment_reference) DO UPDATE 
                SET interest_rate = EXCLUDED.interest_rate
                RETURNING gift_token;
            `;
            const giftResult = await pool.query(insertQuery, [
                req.user.id, recipientEmail, plan, amount, tenure, currency, interestRate, reference
            ]);

            res.json({ success: true, token: giftResult.rows[0].gift_token });
        } else {
            res.status(400).json({ success: false, message: verification.data?.gateway_response || "Payment failed" });
        }
    } catch (error: any) {
        console.error("Verify Gift Error:", error);
        res.status(500).json({ success: false, message: error.message || "Failed to verify gift" });
    }
});

/**
 * @swagger
 * /api/investments/claim-gift/{token}:
 *   get:
 *     summary: Fetch gift details for a recipient
 */
router.get('/claim-gift/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const result = await pool.query('SELECT * FROM investment_gifts WHERE gift_token = $1', [token]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Gift not found or already claimed" });
        }

        res.json(result.rows[0]);
    } catch (error: any) {
        console.error("Claim Gift Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


/**
 * @swagger
 * /api/investments/{id}:
 *   get:
 *     summary: Get investment details
 *     tags: [Investments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Investment details
 *       404:
 *         description: Not found
 */
router.get('/:id', isAuthenticated, async (req: any, res, next) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return next(); // Fallthrough if not a number

        const investment = await investmentService.getInvestmentById(id);
        if (!investment) {
            return res.status(404).json({ message: "Investment not found" });
        }

        if (investment.customer_id !== req.user.id) {
            return res.status(403).json({ message: "Forbidden" });
        }

        res.json(investment);
    } catch (error: any) {
        console.error("Get Investment Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/investments/{id}/liquidate:
 *   post:
 *     summary: Request liquidation for an investment
 *     tags: [Investments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               liquidation_type: { type: string, enum: [FULL, CUSTOM] }
 *               amount: { type: number }
 *     responses:
 *       200:
 *         description: Liquidation requested successfully
 *       400:
 *         description: Bad request
 */
router.post('/:id/liquidate', isAuthenticated, async (req: any, res) => {
    try {
        const id = parseInt(req.params.id);
        const { liquidation_type, amount } = req.body;
        const userId = req.user.id;

        if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
        if (!['FULL', 'CUSTOM'].includes(liquidation_type)) return res.status(400).json({ message: "Invalid liquidation type" });

        // Get the investment to validate ownership and status
        const investmentResult = await pool.query('SELECT * FROM investments WHERE id = $1', [id]);
        if (investmentResult.rows.length === 0) {
            return res.status(404).json({ message: "Investment not found" });
        }

        const investment = investmentResult.rows[0];

        if (investment.customer_id !== userId) {
            return res.status(403).json({ message: "Forbidden" });
        }

        if (investment.is_liquidating) {
            return res.status(400).json({ message: "A liquidation request is already processing for this investment." });
        }

        if (['liquidated', 'rejected', 'pending_payment'].includes(investment.status)) {
            return res.status(400).json({ message: `Cannot liquidate investment in ${investment.status} status.` });
        }

        // Calculate actual liquidation amount
        let requestAmount = 0;
        if (liquidation_type === 'FULL') {
            requestAmount = Number(investment.investment_amount); // Ideally includes interest over time, simplified here
        } else {
            requestAmount = Number(amount);
            if (isNaN(requestAmount) || requestAmount <= 0) {
                return res.status(400).json({ message: "Invalid custom amount" });
            }
            if (requestAmount > Number(investment.investment_amount)) {
                return res.status(400).json({ message: "Requested amount exceeds investment balance" });
            }
        }

        // Check for early penalty (if current date < maturity date)
        // Since we don't have a direct maturity_date column, we might compute it or assume there's a tenure_days.
        // Let's compute maturity date = created_at + tenure_days
        let isEarly = false;
        let penaltyAmount = 0;
        
        const createdDate = new Date(investment.created_at);
        const tenureMs = (investment.tenure_days || 0) * 24 * 60 * 60 * 1000;
        const maturityDate = new Date(createdDate.getTime() + tenureMs);

        if (new Date() < maturityDate) {
            isEarly = true;
            penaltyAmount = requestAmount * 0.10; // 10% penalty
        }

        // Mutate the record
        const updateQuery = `
            UPDATE investments
            SET is_liquidating = true,
                liquidation_type = $1,
                liquidation_requested_amount = $2,
                liquidation_penalty_amount = $3,
                liquidation_stage = 'customer_experience'
            WHERE id = $4
            RETURNING *;
        `;
        const updated = await pool.query(updateQuery, [liquidation_type, requestAmount, penaltyAmount, id]);

        res.status(200).json({ 
            success: true, 
            message: "Liquidation requested successfully. It is now being processed.",
            data: updated.rows[0]
        });

    } catch (error: any) {
        console.error("Liquidation Request Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;


import { Router } from 'express';
import { investmentService } from '../services/investmentService.js';

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
 *     summary: Create a new Corporate Investment
 *     tags: [Investments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               investment_type: { type: string, enum: [NOLT_RISE, NOLT_VAULT] }
 *               company_name: { type: string }
 *               company_address: { type: string }
 *               date_of_incorporation: { type: string, format: date }
 *               directors_are_pep: { type: boolean }
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
 *               investment_amount: { type: number }
 *               tenure_days: { type: number }
 *               currency: { type: string, enum: [NGN, USD] }
 *               signatures: { type: array, items: { type: string } }
 *               cac_url: { type: string }
 *               rep_selfie_url: { type: string }
 *               rep_id_url: { type: string }
 *               director_1_id_url: { type: string }
 *               director_2_id_url: { type: string }
 *               memart_url: { type: string }
 *               annual_returns_url: { type: string }
 *               board_resolution_url: { type: string }
 *               aml_cft_url: { type: string }
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
            'rep_state_of_residence',
            'investment_amount', 'tenure_days', 'currency',
            'signatures', 'payment_receipt_url'
        ];

        // Basic validation
        const missing = keys.filter(k => !req.body[k]);
        if (missing.length > 0) {
            return res.status(400).json({ message: `Missing required fields: ${missing.join(', ')}` });
        }

        const investment = await investmentService.createInvestment(userId, req.body);
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
router.get('/:id', isAuthenticated, async (req: any, res) => {
    try {
        const investment = await investmentService.getInvestmentById(parseInt(req.params.id));
        if (!investment) {
            return res.status(404).json({ message: "Investment not found" });
        }

        // Security check: ensure investment belongs to user (or is generic if allowed, but strict ownership is better)
        if (investment.customer_id !== req.user.id) {
            return res.status(403).json({ message: "Forbidden" });
        }

        res.json(investment);
    } catch (error: any) {
        console.error("Get Investment Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;

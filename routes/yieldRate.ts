import { Router } from 'express';
import { yieldRateService } from '../services/yieldRateService.js';

const router = Router();

// Middleware to check if user is a Superadmin (Protecting management APIs)
const isSuperAdmin = (req: any, res: any, next: any) => {
    if (req.isAuthenticated() && (req.user.role === 'super_admin' || req.user.role === 'superadmin')) {
        return next();
    }
    return res.status(403).json({ message: "Access denied. Superadmin only." });
};

/**
 * @swagger
 * /api/yield-rates:
 *   post:
 *     summary: Create a new yield rate
 *     tags: [Yield Rates]
 *     security:
 *       - cookieAuth: []
 */
router.post('/', isSuperAdmin, async (req, res) => {
    try {
        const { plan_name, currency, tenure_months, min_amount, max_amount, interest_rate } = req.body;

        if (!plan_name || !currency || !tenure_months || !min_amount || !interest_rate) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const min = parseFloat(min_amount);
        const max = max_amount ? parseFloat(max_amount) : null;

        if (max !== null && max < min) {
            return res.status(400).json({ message: "Maximum amount cannot be less than minimum amount" });
        }

        const isDuplicate = await yieldRateService.checkDuplicate({
            plan_name,
            currency,
            min_amount: min,
            max_amount: max,
            interest_rate: parseFloat(interest_rate)
        });

        if (isDuplicate) {
            return res.status(409).json({ message: "A rate with the same plan, range, and interest already exists." });
        }

        const rate = await yieldRateService.createRate({
            plan_name,
            currency,
            tenure_months: parseInt(tenure_months),
            min_amount: parseFloat(min_amount),
            max_amount: max_amount ? parseFloat(max_amount) : null,
            interest_rate: parseFloat(interest_rate)
        });

        res.status(201).json(rate);
    } catch (error: any) {
        console.error("Create Yield Rate Error:", error);
        res.status(500).json({ message: error.message || "Internal server error" });
    }
});

/**
 * @swagger
 * /api/yield-rates:
 *   get:
 *     summary: Get all yield rates
 *     tags: [Yield Rates]
 */
router.get('/', async (req, res) => {
    try {
        const rates = await yieldRateService.getAllRates();
        res.json(rates);
    } catch (error: any) {
        console.error("Get Yield Rates Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/yield-rates/active:
 *   get:
 *     summary: Get all active yield rates
 *     tags: [Yield Rates]
 */
router.get('/active', async (req, res) => {
    try {
        const rates = await yieldRateService.getActiveRates();
        res.json(rates);
    } catch (error: any) {
        console.error("Get Active Yield Rates Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/yield-rates/{id}:
 *   put:
 *     summary: Update a yield rate
 *     tags: [Yield Rates]
 */
router.put('/:id', isSuperAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { min_amount, max_amount } = req.body;

        if (min_amount !== undefined || max_amount !== undefined) {
            // In a real app we'd fetch the existing record if only one is provided, 
            // but for simplicity we check the provided ones if both exist in body
            const min = min_amount !== undefined ? parseFloat(min_amount) : null;
            const max = max_amount !== undefined ? (max_amount === null ? null : parseFloat(max_amount)) : undefined;

            // If both are present in request, validate them
            if (min !== null && max !== undefined && max !== null && max < min) {
                return res.status(400).json({ message: "Maximum amount cannot be less than minimum amount" });
            }
        }

        const existingRate = await yieldRateService.getRateById(id);
        if (!existingRate) {
            return res.status(404).json({ message: "Rate not found" });
        }

        const isDuplicate = await yieldRateService.checkDuplicate({
            plan_name: req.body.plan_name || existingRate.plan_name,
            currency: req.body.currency || existingRate.currency,
            min_amount: req.body.min_amount !== undefined ? parseFloat(req.body.min_amount) : existingRate.min_amount,
            max_amount: req.body.max_amount !== undefined ? (req.body.max_amount === null ? null : parseFloat(req.body.max_amount)) : existingRate.max_amount,
            interest_rate: req.body.interest_rate !== undefined ? parseFloat(req.body.interest_rate) : existingRate.interest_rate
        }, id);

        if (isDuplicate) {
            return res.status(409).json({ message: "Another rate with the same plan, range, and interest already exists." });
        }

        const rate = await yieldRateService.updateRate(id, req.body);
        if (!rate) {
            return res.status(404).json({ message: "Rate not found" });
        }
        res.json(rate);
    } catch (error: any) {
        console.error("Update Yield Rate Error:", error);
        res.status(500).json({ message: error.message || "Internal server error" });
    }
});

/**
 * @swagger
 * /api/yield-rates/{id}:
 *   delete:
 *     summary: Delete a yield rate
 *     tags: [Yield Rates]
 */
router.delete('/:id', isSuperAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const rate = await yieldRateService.deleteRate(id);
        if (!rate) {
            return res.status(404).json({ message: "Rate not found" });
        }
        res.json({ message: "Rate deleted successfully" });
    } catch (error: any) {
        console.error("Delete Yield Rate Error:", error);
        res.status(500).json({ message: error.message || "Internal server error" });
    }
});

export default router;

import { Router } from 'express';
import { kycService } from '../services/kycService.js';

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
 * /api/kyc/verify-bvn:
 *   post:
 *     summary: Verify BVN and match with user data
 *     tags: [KYC]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bvn: { type: string }
 *               firstName: { type: string }
 *               dob: { type: string }
 *               mobileNumber: { type: string }
 */
router.post('/verify-bvn', isAuthenticated, async (req: any, res) => {
    try {
        const { bvn, firstName, dob, mobileNumber } = req.body;

        if (!bvn) {
            return res.status(400).json({ success: false, message: "BVN is required" });
        }

        const bvnData = await kycService.lookupBVN(bvn);
        if (!bvnData) {
            return res.status(404).json({ success: false, message: "BVN not found or invalid" });
        }

        const validation = kycService.validateBVNMatch({ firstName, dob, mobileNumber }, bvnData);

        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.details,
                matches: validation.matches,
                matchCount: validation.matchCount
            });
        }

        res.json({
            success: true,
            message: "BVN verified successfully",
            data: {
                firstName: bvnData.firstName,
                lastName: bvnData.lastName,
                matchCount: validation.matchCount
            }
        });

    } catch (error: any) {
        console.error("KYC Route Error:", error);
        res.status(500).json({ success: false, message: error.message || "Internal server error during KYC validation" });
    }
});

export default router;

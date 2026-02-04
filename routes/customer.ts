import { Router } from 'express';

const router = Router();

// Routes start with /api

/**
 * @swagger
 * components:
 *   schemas:
 *     Customer:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: The user ID
 *         google_id:
 *           type: string
 *           nullable: true
 *           description: The Google ID of the user (Customers only)
 *         email:
 *           type: string
 *           description: The user's email
 *         full_name:
 *           type: string
 *           description: The user's full name
 *         role:
 *           type: string
 *           description: The user's role (e.g., customer, superadmin, sales_manager)
 *           default: customer
 *         team_id:
 *           type: string
 *           description: ID of the team (Staff only)
 *         manager_id:
 *           type: integer
 *           description: ID of the manager (Staff only)
 *         is_active:
 *           type: boolean
 *           description: Whether the account is active
 *         avatar_url:
 *           type: string
 *           description: URL to the user's avatar
 *         new_comer:
 *           type: boolean
 *           description: Whether the user is new
 */

/**
 * @swagger
 * /api/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Customers]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The logged-in customer's profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Customer'
 *       401:
 *         description: Unauthorized
 */
router.get('/me', (req, res) => {
    if (req.isAuthenticated()) {
        res.json(req.user);
    } else {
        res.status(401).json({ message: "Unauthorized" });
    }
});

export default router;

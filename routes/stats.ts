import { Router } from 'express';
import pool from '../config/db.js';

const router = Router();

/**
 * @swagger
 * /api/stats/dashboard:
 *   get:
 *     summary: Get dashboard statistics (Staff/Admin)
 *     tags: [Stats]
 *     responses:
 *       200:
 *         description: Dashboard statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalLoans:
 *                   type: integer
 *                 totalUsers:
 *                   type: integer
 *                 pendingLoans:
 *                   type: integer
 */
router.get('/dashboard', async (req, res) => {
    try {
        // Fetch Total Loans
        const totalLoansResult = await pool.query('SELECT COUNT(*)::int as count FROM loans');
        const totalLoans = totalLoansResult.rows[0].count;

        // Fetch Total Users
        const totalUsersResult = await pool.query('SELECT COUNT(*)::int as count FROM customers');
        const totalUsers = totalUsersResult.rows[0].count;

        // Fetch Pending Loans
        const pendingLoansResult = await pool.query("SELECT COUNT(*)::int as count FROM loans WHERE status = 'pending'");
        const pendingLoans = pendingLoansResult.rows[0].count;

        res.json({
            totalLoans,
            totalUsers,
            pendingLoans
        });

    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;

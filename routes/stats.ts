import { Router } from 'express';
import sql from '../config/db.js';

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
        const totalLoansResult = await sql`SELECT COUNT(*)::int as count FROM loans`;
        const totalLoans = totalLoansResult[0].count;

        // Fetch Total Users (Customers + Staff/Admins, or just Customers based on requirement. Usually users implies all or just customers. Let's assume customers for "Active Users" context usually)
        // Adjusting query to count customers specifically as per most dashboards, or all users. The dashboard card says "Active Users". 
        // Let's count all entries in 'customers' table for now, or filter by is_active if available.
        // User requested "total number of users from the database".
        const totalUsersResult = await sql`SELECT COUNT(*)::int as count FROM customers`;
        const totalUsers = totalUsersResult[0].count;

        // Fetch Pending Loans
        const pendingLoansResult = await sql`SELECT COUNT(*)::int as count FROM loans WHERE status = 'pending'`;
        const pendingLoans = pendingLoansResult[0].count;

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

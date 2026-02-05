import { Router } from 'express';
import sql from '../config/db.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const router = Router();

// Middleware to check if user is a Superadmin
const isSuperAdmin = (req: any, res: any, next: any) => {
    if (req.isAuthenticated() && req.user.role === 'super_admin') {
        return next();
    }
    return res.status(403).json({ message: "Access denied. Superadmin only." });
};

/**
 * @swagger
 * /staff/invite:
 *   post:
 *     summary: Invite a new staff member
 *     tags: [Staff]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, role, full_name]
 *             properties:
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *               full_name:
 *                 type: string
 *               team_id:
 *                 type: string
 *               manager_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Staff invited successfully
 *       403:
 *         description: Only superadmin can invite
 */
router.post('/invite', isSuperAdmin, async (req, res) => {
    const { email, role, full_name, team_id, manager_id } = req.body;

    if (!email || !role || !full_name) {
        return res.status(400).json({ message: "Email, role, and full_name are required." });
    }

    try {
        console.log("DEBUG: Attempting to invite:", email, role);

        // Check if user already exists
        const existing = await sql`SELECT * FROM customers WHERE email = ${email} LIMIT 1`;
        console.log("DEBUG: Existing check result:", existing);

        if (existing.length > 0) {
            return res.status(400).json({ message: "User with this email already exists." });
        }

        // Generate a temporary setup token (using otp_secret column for now or we could add a new one)
        // For simplicity reusing otp_secret as a temp token holder for setup, or we can just send them a link with the ID signed.
        // Let's assume we just create them active=false and they set password. 
        // Better: Create them with NO password.

        console.log("DEBUG: Inserting new staff...");
        const newStaff = await sql`
            INSERT INTO customers (email, role, full_name, team_id, manager_id, is_active, new_comer)
            VALUES (${email}, ${role}, ${full_name}, ${team_id || null}, ${manager_id || null}, ${true}, ${true})
            RETURNING id, email, role
        `;
        console.log("DEBUG: Insert result:", newStaff);

        // In a real app, we would send an email here.
        // For now, we return the specific URL for the frontend to display (or for you to copy).

        const setupLink = `http://localhost:3000/staff-setup?email=${email}`;

        res.json({
            message: "Staff created successfully.",
            details: newStaff[0],
            setup_link: setupLink,
            note: "Share this link with the staff member to set their password."
        });

    } catch (err) {
        console.error("DEBUG: ERROR in invite:", err);
        res.status(500).json({ message: "Error inviting staff.", error: String(err) });
    }
});

/**
 * @swagger
 * /staff/complete-setup:
 *   post:
 *     summary: Set password for new staff account
 *     tags: [Staff]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password set successfully
 */
router.post('/complete-setup', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password required." });
    }

    if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    try {
        const user = await sql`SELECT * FROM customers WHERE email = ${email} LIMIT 1`;

        if (user.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        if (user[0].password_hash) {
            return res.status(400).json({ message: "Password already set. Please login." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await sql`
            UPDATE customers 
            SET password_hash = ${hashedPassword}
            WHERE email = ${email}
        `;

        res.json({ message: "Account setup complete. You can now login." });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error setting password." });
    }
});

/**
 * @swagger
 * /api/staff/loans/pending:
 *   get:
 *     summary: Get pending loans queue with officer details
 *     tags: [Staff]
 *     responses:
 *       200:
 *         description: List of pending loans
 */
router.get('/loans/pending', async (req, res) => {
    try {
        const loans = await sql`
            SELECT 
                l.id, l.applicant_full_name, l.requested_loan_amount, l.created_at, l.status, l.stage,
                c.full_name as officer_name, c.email as officer_email
            FROM loans l
            LEFT JOIN customers c ON l.sales_officer_id = c.id
            WHERE l.status = 'pending'
            ORDER BY l.created_at DESC
        `;
        res.json(loans);
    } catch (error) {
        console.error("Error fetching pending loans:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;

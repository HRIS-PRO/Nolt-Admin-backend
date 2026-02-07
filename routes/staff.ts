import { Router } from 'express';
import sql from '../config/db.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { resendService } from '../services/resendService.js';

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
        // Check if user already exists
        const existing = await sql`SELECT * FROM customers WHERE email = ${email} LIMIT 1`;
        if (existing.length > 0) {
            return res.status(400).json({ message: "User with this email already exists." });
        }

        // Generate Random Password or use provided
        const tempPassword = req.body.password || (Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase());
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        // Insert new staff
        const newStaff = await sql`
            INSERT INTO customers (email, role, full_name, team_id, manager_id, is_active, new_comer, password_hash)
            VALUES (${email}, ${role}, ${full_name}, ${team_id || null}, ${manager_id || null}, ${true}, ${true}, ${hashedPassword})
            RETURNING id, email, role
        `;

        // Send Email via Termii
        try {
            await resendService.sendWelcomeEmail(email, full_name, tempPassword);
        } catch (emailError) {
            console.error("Failed to send credential email:", emailError);
            // We don't rollback user creation, but we warn the admin
            return res.json({
                message: "Staff created, but failed to send email. Password is provided below.",
                details: newStaff[0],
                temp_password: tempPassword
            });
        }

        res.json({
            message: "Staff invited successfully. Credentials sent via email.",
            details: newStaff[0]
        });

    } catch (err) {
        console.error("Error inviting staff:", err);
        res.status(500).json({ message: "Error inviting staff.", error: String(err) });
    }
});

/**
 * @swagger
 * /staff/revoke-access:
 *   post:
 *     summary: Revoke access for a staff member
 *     tags: [Staff]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Access revoked successfully
 */
router.post('/revoke-access', isSuperAdmin, async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "User ID is required" });

    try {
        await sql`UPDATE customers SET is_active = false WHERE id = ${userId}`;
        res.json({ message: "Access revoked successfully" });
    } catch (error) {
        console.error("Error revoking access:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /staff/referral-code:
 *   post:
 *     summary: Generate or refresh referral code for a staff member
 *     tags: [Staff]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Referral code generated successfully
 */
router.post('/referral-code', isSuperAdmin, async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "User ID is required" });

    try {
        const [user] = await sql`SELECT full_name FROM customers WHERE id = ${userId}`;
        if (!user) return res.status(404).json({ message: "User not found" });

        // Generate Code: FIRST_NAME-RANDOM (e.g. ALEX-882)
        const namePart = user.full_name.split(' ')[0].toUpperCase().substring(0, 4);
        const randomPart = Math.floor(100 + Math.random() * 900);
        const code = `${namePart}-${randomPart}`;

        await sql`UPDATE customers SET referral_code = ${code} WHERE id = ${userId}`;

        res.json({ message: "Referral code generated", referral_code: code });
    } catch (error) {
        console.error("Error generating referral code:", error);
        res.status(500).json({ message: "Internal server error" });
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
 * /api/staff/loans:
 *   get:
 *     summary: Get all loans with officer details
 *     tags: [Staff]
 *     responses:
 *       200:
 *         description: List of all loans
 */
router.get('/loans', async (req, res) => {
    try {
        const loans = await sql`
            SELECT 
                l.id, l.applicant_full_name, l.requested_loan_amount, l.created_at, l.status, l.stage,
                c.full_name as officer_name, c.email as officer_email
            FROM loans l
            LEFT JOIN customers c ON l.sales_officer_id = c.id
            ORDER BY l.created_at DESC
        `;
        res.json(loans);
    } catch (error) {
        console.error("Error fetching loans:", error);
        res.status(500).json({ message: "Internal server error" });
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



/**
 * @swagger
 * /staff/users:
 *   get:
 *     summary: Get all users with their roles
 *     tags: [Staff]
 *     responses:
 *       200:
 *         description: List of all users
 */
router.get('/users', async (req, res) => {
    try {
        const users = await sql`
            SELECT 
                c.id, c.email, c.full_name, c.role, c.is_active, c.created_at, 
                c.avatar_url, c.referral_code,
                m.full_name as manager_name
            FROM customers c
            LEFT JOIN customers m ON c.manager_id = m.id
            ORDER BY c.created_at DESC
        `;
        res.json(users);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /staff/users/{id}/role:
 *   put:
 *     summary: Update a user's role
 *     tags: [Staff]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [customer, staff, admin, super_admin]
 *     responses:
 *       200:
 *         description: Role updated successfully
 */
router.put('/users/:id/role', isSuperAdmin, async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!role) {
        return res.status(400).json({ message: "Role is required." });
    }

    try {
        const updatedUser = await sql`
            UPDATE customers 
            SET role = ${role}
            WHERE id = ${id}
            RETURNING id, email, full_name, role
        `;

        if (updatedUser.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        res.json({ message: "Role updated successfully.", user: updatedUser[0] });
    } catch (error) {
        console.error("Error updating role:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /staff/loans/{id}:
 *   get:
 *     summary: Get loan details by ID
 *     tags: [Staff]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Loan details
 *       404:
 *         description: Loan not found
 */
router.get('/loans/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const loans = await sql`
            SELECT 
                l.*,
                c.full_name as officer_name, c.email as officer_email, c.avatar_url as officer_avatar
            FROM loans l
            LEFT JOIN customers c ON l.sales_officer_id = c.id
            WHERE l.id = ${id}
            LIMIT 1
        `;

        if (loans.length === 0) {
            return res.status(404).json({ message: "Loan not found" });
        }

        res.json(loans[0]);
    } catch (error) {
        console.error("Error fetching loan details:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /staff/loans/{id}/activities:
 *   get:
 *     summary: Get activity timeline for a loan
 *     tags: [Staff]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of activities
 */
router.get('/loans/:id/activities', async (req, res) => {
    const { id } = req.params;
    try {
        const activities = await sql`
            SELECT la.*, c.full_name as user_name, c.email as user_email, c.role as user_role, c.avatar_url
            FROM loan_activities la
            LEFT JOIN customers c ON la.user_id = c.id
            WHERE la.loan_id = ${id}
            ORDER BY la.created_at DESC
        `;
        res.json(activities);
    } catch (error) {
        console.error("Error fetching activities:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

router.get('/loans/:id/documents', async (req, res) => {
    const { id } = req.params;
    try {
        const documents = await sql`
            SELECT ld.*, c.full_name as uploaded_by_name
            FROM loan_documents ld
            LEFT JOIN customers c ON ld.uploaded_by_user_id = c.id
            WHERE ld.loan_id = ${id}
            ORDER BY ld.created_at DESC
        `;
        res.json(documents);
    } catch (error) {
        console.error("Error fetching documents:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /staff/loans/{id}/action:
 *   post:
 *     summary: Perform an action on a loan (approve, reject, return)
 *     tags: [Staff]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approve, reject, return]
 *               data:
 *                 type: object
 *                 description: Optional data like eligible_amount or rejection reason
 *     responses:
 *       200:
 *         description: Action successful
 *       403:
 *         description: Unauthorized action for current stage/role
 */
router.post('/loans/:id/action', async (req, res) => {
    const { id } = req.params;
    const { action, data } = req.body;
    // @ts-ignore
    const user = req.user as any;

    if (!user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const [loan] = await sql`SELECT * FROM loans WHERE id = ${id} LIMIT 1`;
        if (!loan) return res.status(404).json({ message: "Loan not found" });

        const currentStage = loan.stage || 'submitted';

        // --- PERMISSION MATRIX ---
        // Defines who can act at what stage
        const canAct = (requiredRole: string | string[], allowedStage: string) => {
            // Super Admins can do anything anywhere (optional, maybe restrict?)
            if (user.role === 'super_admin' || user.role === 'superadmin') return true;

            const hasRole = Array.isArray(requiredRole)
                ? requiredRole.includes(user.role)
                : user.role === requiredRole;

            return hasRole && currentStage === allowedStage;
        };

        let nextStage = '';

        let updateData: Record<string, any> = {};

        // --- STAGE TRANSITION LOGIC ---

        // 1. Customer Experience -> Credit Check 1
        if (currentStage === 'submitted' || currentStage === 'customer_experience') {
            if (!canAct(['customer_experience', 'customer_service'], currentStage)) {
                // Determine if we should allow 'submitted' to be picked up by CX
                // For now, treat 'submitted' same as 'customer_experience' active work
                if (!canAct(['customer_experience', 'customer_service'], 'customer_experience') && currentStage !== 'submitted') {
                    return res.status(403).json({ message: `Role ${user.role} cannot act on stage ${currentStage}` });
                }
            }
            if (action === 'approve') nextStage = 'credit_check_1';
        }

        // 2. Credit Check 1 (Sales Officer) -> Credit Check 2 (Sales Manager)
        else if (currentStage === 'credit_check_1') {
            if (!canAct('sales_officer', 'credit_check_1')) {
                return res.status(403).json({ message: "Only Sales Officers can process Credit Check 1" });
            }
            if (action === 'approve') nextStage = 'credit_check_2';
            if (action === 'return') nextStage = 'customer_experience';
        }

        // 3. Credit Check 2 (Sales Manager) -> Internal Audit
        else if (currentStage === 'credit_check_2') {
            // Assuming role is 'sales_manager' or 'credit_manager' based on system
            if (!canAct(['sales_manager', 'credit_manager'], 'credit_check_2')) {
                return res.status(403).json({ message: "Only Sales/Credit Managers can process Credit Check 2" });
            }

            if (action === 'approve') {
                if (!data?.eligible_amount) {
                    return res.status(400).json({ message: "Eligible amount is required for approval." });
                }
                updateData = { eligible_amount: parseFloat(data.eligible_amount) };
                nextStage = 'internal_audit';
            }
            if (action === 'return') nextStage = 'credit_check_1';
        }

        // 4. Internal Audit -> Finance
        else if (currentStage === 'internal_audit') {
            if (!canAct('internal_audit', 'internal_audit')) {
                return res.status(403).json({ message: "Only Internal Audit can process this stage" });
            }
            if (action === 'approve') nextStage = 'finance';
            if (action === 'return') nextStage = 'credit_check_2';
        }

        // 5. Finance -> Disbursed
        else if (currentStage === 'finance') {
            if (!canAct('finance', 'finance')) {
                return res.status(403).json({ message: "Only Finance can process this stage" });
            }
            if (action === 'approve') {
                nextStage = 'disbursed';
                updateData = { ...updateData, status: 'approved' }; // Final status
            }
            if (action === 'return') nextStage = 'internal_audit';
        }

        else if (currentStage === 'disbursed') {
            return res.status(400).json({ message: "Loan is already disbursed." });
        }

        else {
            // Catch-all/Error
            return res.status(403).json({ message: "Invalid stage transition or unauthorized." });
        }



        // --- PERFORM UPDATE ---

        if (nextStage || action === 'reject') {
            // --- PERFORM UPDATE ---
            if (action === 'reject') {
                await sql`
                    UPDATE loans 
                    SET status = 'rejected', stage = 'rejected', updated_at = NOW() 
                    WHERE id = ${id}
                `;
            } else {
                if (Object.keys(updateData).includes('eligible_amount')) {
                    await sql`
                        UPDATE loans 
                        SET stage = ${nextStage}, eligible_amount = ${updateData['eligible_amount']}, updated_at = NOW() 
                        ${updateData['status'] ? sql`, status = ${updateData['status']}` : sql``}
                        WHERE id = ${id}
                    `;
                } else {
                    await sql`
                        UPDATE loans 
                        SET stage = ${nextStage}, updated_at = NOW()
                        ${updateData['status'] ? sql`, status = ${updateData['status']}` : sql``}
                        WHERE id = ${id}
                    `;
                }
            }

            // --- LOG ACTIVITY ---
            try {
                const activityDescription = action === 'reject'
                    ? `Application rejected at ${currentStage.replace(/_/g, ' ')}`
                    : `Moved application from ${currentStage.replace(/_/g, ' ')} to ${nextStage.replace(/_/g, ' ')}`;

                await sql`
                    INSERT INTO loan_activities (loan_id, user_id, action_type, description, metadata)
                    VALUES (${id}, ${user.id}, ${action}, ${activityDescription}, ${JSON.stringify({ from: currentStage, to: nextStage || 'rejected', ...updateData })})
                `;
            } catch (logError) {
                console.error("Failed to log activity:", logError);
                // Non-blocking error
            }

            return res.json({ message: action === 'reject' ? "Loan rejected" : `Loan moved to ${nextStage}`, stage: nextStage || 'rejected' });
        }

        res.status(400).json({ message: "Action could not be completed." });

    } catch (error) {
        console.error("Error processing loan action:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /staff/change-password:
 *   post:
 *     summary: Change staff password
 *     tags: [Staff]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       400:
 *         description: Invalid password or request
 */
router.post('/change-password', async (req, res) => {
    // @ts-ignore
    const user = req.user as any;
    const { oldPassword, newPassword } = req.body;

    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (!oldPassword || !newPassword) {
        return res.status(400).json({ message: "Both old and new passwords are required." });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters long." });
    }

    try {
        // Fetch current password hash
        const [currentUser] = await sql`SELECT password_hash FROM customers WHERE id = ${user.id}`;

        if (!currentUser || !currentUser.password_hash) {
            return res.status(400).json({ message: "User not found or no password set." });
        }

        // Verify old password
        const isMatch = await bcrypt.compare(oldPassword, currentUser.password_hash);
        if (!isMatch) {
            return res.status(400).json({ message: "Incorrect current password." });
        }

        // Hash new password
        const newHashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await sql`
            UPDATE customers 
            SET password_hash = ${newHashedPassword}
            WHERE id = ${user.id}
        `;

        res.json({ message: "Password updated successfully." });

    } catch (error) {
        console.error("Error changing password:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
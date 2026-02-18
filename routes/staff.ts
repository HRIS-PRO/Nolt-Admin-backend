import { Router } from 'express';
import pool from '../config/db.js';
import { resendService } from '../services/resendService.js';
import { exportService } from '../services/exportService.js';
import bcrypt from 'bcrypt';

import { getIO } from '../socket.js';

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
        const existing = await pool.query('SELECT * FROM customers WHERE email = $1 LIMIT 1', [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ message: "User with this email already exists." });
        }

        // Generate Random Password or use provided
        const tempPassword = req.body.password || (Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase());
        const hashedPassword = await bcrypt.hash(tempPassword, 10);

        // Insert new staff
        const newStaffResult = await pool.query(
            `INSERT INTO customers (email, role, full_name, team_id, manager_id, is_active, new_comer, password_hash)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, email, role`,
            [email, role, full_name, team_id || null, manager_id || null, true, true, hashedPassword]
        );
        const newStaff = newStaffResult.rows[0];

        // Send Email via Termii
        try {
            await resendService.sendWelcomeEmail(email, full_name, tempPassword);
        } catch (emailError) {
            console.error("Failed to send credential email:", emailError);
            // We don't rollback user creation, but we warn the admin
            return res.json({
                message: "Staff created, but failed to send email. Password is provided below.",
                details: newStaff,
                temp_password: tempPassword
            });
        }

        res.json({
            message: "Staff invited successfully. Credentials sent via email.",
            details: newStaff
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
        await pool.query('UPDATE customers SET is_active = false WHERE id = $1', [userId]);
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
        const userResult = await pool.query('SELECT full_name FROM customers WHERE id = $1', [userId]);
        const user = userResult.rows[0];
        if (!user) return res.status(404).json({ message: "User not found" });

        // Generate Code: FIRST_NAME-RANDOM (e.g. ALEX-882)
        const namePart = user.full_name.split(' ')[0].toUpperCase().substring(0, 4);
        const randomPart = Math.floor(100 + Math.random() * 900);
        const code = `${namePart}-${randomPart}`;

        await pool.query('UPDATE customers SET referral_code = $1 WHERE id = $2', [code, userId]);

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
        const userResult = await pool.query('SELECT * FROM customers WHERE email = $1 LIMIT 1', [email]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        const user = userResult.rows[0];

        if (user.password_hash) {
            return res.status(400).json({ message: "Password already set. Please login." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.query(
            'UPDATE customers SET password_hash = $1 WHERE email = $2',
            [hashedPassword, email]
        );

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
        const { page = 1, limit = 10, search = '', status = '', stage = '' } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        // Build Filters
        const filters: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (typeof status === 'string' && status) {
            filters.push(`l.status = $${paramIndex++}`);
            values.push(status);
        }
        if (typeof stage === 'string' && stage) {
            filters.push(`l.stage = $${paramIndex++}`);
            values.push(stage);
        }
        if ((req.user as any)?.role === 'sales_officer') {
            filters.push(`l.sales_officer_id = $${paramIndex++}`);
            values.push((req.user as any).id);
        }

        // Restrict Finance Role to 'finance' stage
        if ((req.user as any)?.role === 'finance') {
            filters.push(`l.stage = $${paramIndex++}`);
            values.push('finance');
        }

        if (typeof search === 'string' && search) {
            const searchPattern = `%${search}%`;
            filters.push(`(
                l.applicant_full_name ILIKE $${paramIndex} OR 
                l.id::text ILIKE $${paramIndex} OR
                c.full_name ILIKE $${paramIndex} OR
                c.email ILIKE $${paramIndex}
            )`);
            values.push(searchPattern);
            paramIndex++;
        }


        // Filter Special Loans logic REMOVED as per user request (Show all loans)
        // const { include_special } = req.query;
        // if (include_special !== 'true') {
        //     filters.push(`(l.loan_type IS NULL OR l.loan_type NOT IN ('topup', 'buy_over', 're-app', 'add_on'))`);
        // }

        const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

        // Main Query
        const loansQuery = `
            SELECT 
                l.id, l.applicant_full_name, l.requested_loan_amount, l.created_at, l.status, l.stage, l.product_type,
                l.loan_type, l.topup_amount, l.buy_over_amount,
                c.full_name as officer_name, c.email as officer_email, l.sales_officer_id
            FROM loans l
            LEFT JOIN customers c ON l.sales_officer_id = c.id
            ${whereClause}
            ORDER BY l.created_at DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `;
        const loansValues = [...values, Number(limit), offset];

        // Count Query
        const countQuery = `
            SELECT COUNT(l.id) as total
            FROM loans l
            LEFT JOIN customers c ON l.sales_officer_id = c.id
            ${whereClause}
        `;
        // Count query uses the same values as filter, but not limit/offset
        const countValues = [...values];


        const loansResult = await pool.query(loansQuery, loansValues);
        const countResult = await pool.query(countQuery, countValues);

        res.json({
            loans: loansResult.rows,
            total: Number(countResult.rows[0].total),
            page: Number(page),
            limit: Number(limit)
        });

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
        const filters: string[] = ["l.status = 'pending'"];
        const values: any[] = [];
        let paramIndex = 1;

        if ((req.user as any)?.role === 'sales_officer') {
            filters.push(`l.sales_officer_id = $${paramIndex++}`);
            values.push((req.user as any).id);
        }

        const whereClause = `WHERE ${filters.join(' AND ')}`;

        const query = `
            SELECT 
                l.id, l.applicant_full_name, l.requested_loan_amount, l.created_at, l.status, l.stage, l.product_type,
                l.loan_type, l.topup_amount, l.buy_over_amount,
                c.full_name as officer_name, c.email as officer_email
            FROM loans l
            LEFT JOIN customers c ON l.sales_officer_id = c.id
            ${whereClause}
            ORDER BY l.created_at DESC
        `;

        const result = await pool.query(query, values);
        res.json(result.rows);
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
        const { role, exclude_role, page = 1, limit = 10, search = '' } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        const params: any[] = [];
        let paramIndex = 1;

        let baseQuery = `
            FROM customers c
            LEFT JOIN customers m ON c.manager_id = m.id
            LEFT JOIN loans l ON c.id = l.customer_id
        `;

        const filters: string[] = [];

        if (role) {
            filters.push(`c.role = $${paramIndex++}`);
            params.push(role);
        }

        if (exclude_role) {
            filters.push(`c.role != $${paramIndex++}`);
            params.push(exclude_role);
        }

        if (search) {
            filters.push(`(
                c.full_name ILIKE $${paramIndex} OR 
                c.email ILIKE $${paramIndex} OR
                c.referral_code ILIKE $${paramIndex} OR
                l.mobile_number ILIKE $${paramIndex}
            )`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (filters.length > 0) {
            baseQuery += ` WHERE ${filters.join(' AND ')}`;
        }

        const countQuery = `SELECT COUNT(DISTINCT c.id) as total ${baseQuery}`;
        const usersQuery = `
            SELECT DISTINCT ON (c.id)
                c.id, c.email, c.full_name, c.role, c.is_active, c.created_at, 
                c.avatar_url, c.referral_code,
                m.full_name as manager_name,
                l.mobile_number as phone_number,
                l.state_of_residence,
                l.mda_tertiary as employer,
                l.bvn,
                l.nin,
                l.date_of_birth,
                l.primary_home_address,
                l.bank_name,
                l.account_number,
                l.account_name
            ${baseQuery}
            ORDER BY c.id DESC, l.created_at DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `;

        const queryParams = [...params, limit, offset];
        const countParams = [...params];

        const [usersResult, countResult] = await Promise.all([
            pool.query(usersQuery, queryParams),
            pool.query(countQuery, countParams)
        ]);

        // We still need to sort by created_at DESC roughly, but DISTINCT ON (c.id) forces ORDER BY c.id first.
        // We can re-sort the page results in memory for better UX if needed, or rely on the query.
        // The query orders by c.id, then l.created_at. This groups duplicates.
        // To get a true "Created At DESC" list of users is tricky with DISTINCT ON if we also want one row per user.
        // Better strategy: Subquery or Window function. 
        // For now, let's keep the existing logic but apply pagination. 
        // Note: The previous logic sorted in JS. With pagination, we must sort in SQL to get correct pages.
        // However, standard `DISTINCT ON` usage in PG requires the ORDER BY to match the DISTINCT keys primarily.

        // Let's improve the query to simple select from customers and join the *latest* loan info if needed.
        // But to minimize risk, I will stick to returning the users and let the client handle small sorting discrepancies, 
        // OR essentially assume the ID order (chronological) is roughly acceptable, or sort by id DESC (newest users first).

        // Let's change ORDER BY to `c.id DESC` to show newest users first? 
        // Existing was: `ORDER BY c.id, l.created_at DESC`. 

        // const sortedUsers = usersResult.rows.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        res.json({
            users: usersResult.rows,
            total: Number(countResult.rows[0].total),
            page: Number(page),
            limit: Number(limit)
        });

    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /staff/customers/export-zip:
 *   get:
 *     summary: Export customers as ZIP with PDF profiles
 *     tags: [Staff]
 *     parameters:
 *       - in: query
 *         name: ids
 *         schema:
 *           type: string
 *         description: Comma-separated list of customer IDs to export
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term to filter export (if ids not provided)
 *     responses:
 *       200:
 *         description: ZIP file download
 */
router.get('/customers/export-zip', async (req, res) => {
    try {
        const { ids, search } = req.query;

        let query = `
            SELECT 
                c.id, c.full_name, c.email, c.role, c.is_active, c.created_at,
                l.mobile_number as phone_number,
                l.state_of_residence,
                l.mda_tertiary as employer,
                l.bvn,
                l.nin,
                l.date_of_birth,
                l.primary_home_address,
                l.bank_name,
                l.account_number,
                l.account_name,
                l.govt_id_url,
                l.statement_of_account_url,
                l.proof_of_residence_url,
                l.selfie_verification_url
            FROM customers c
            LEFT JOIN loans l ON c.id = l.customer_id
            WHERE c.role = 'customer'
        `;

        const params: any[] = [];
        let paramIndex = 1;

        if (ids && typeof ids === 'string') {
            const idList = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
            if (idList.length > 0) {
                query += ` AND c.id = ANY($${paramIndex++})`;
                params.push(idList);
            }
        } else if (search) {
            query += ` AND (
                c.full_name ILIKE $${paramIndex} OR 
                c.email ILIKE $${paramIndex} OR
                l.mobile_number ILIKE $${paramIndex}
            )`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        // Distinct to avoid duplicates if multiple loans exist (though we join on customer_id, logic checks out for basic profile)
        // Check duplication: one customer can have multiple loans. joining on loans l will multiply rows.
        // We need distinct customers.
        // But we want the *latest* loan details (address, bank etc) usually.
        // We can use DISTINCT ON (c.id) and ORDER BY c.id, l.created_at DESC to get the latest.

        query = `
            SELECT DISTINCT ON (c.id) 
                c.id, c.full_name, c.email, c.role, c.is_active, c.created_at,
                l.mobile_number as phone_number,
                l.state_of_residence,
                l.mda_tertiary as employer,
                l.bvn,
                l.nin,
                l.date_of_birth,
                l.primary_home_address,
                l.bank_name,
                l.account_number,
                l.account_name,
                l.govt_id_url,
                l.statement_of_account_url,
                l.proof_of_residence_url,
                l.selfie_verification_url
            FROM customers c
            LEFT JOIN loans l ON c.id = l.customer_id
            WHERE c.role = 'customer'
        `;

        // Reset params for fresh query construction
        params.length = 0;
        paramIndex = 1;

        // Re-inject filters to new query
        if (ids && typeof ids === 'string') {
            const idList = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
            if (idList.length > 0) {
                query += ` AND c.id = ANY($${paramIndex++})`;
                params.push(idList);
            }
        } else if (search) {
            query += ` AND (
                c.full_name ILIKE $${paramIndex} OR 
                c.email ILIKE $${paramIndex} OR
                l.mobile_number ILIKE $${paramIndex}
            )`;
            params.push(`%${search}%`);
        }

        query += ` ORDER BY c.id, l.created_at DESC`;

        const result = await pool.query(query, params);
        const customers = result.rows;

        if (customers.length === 0) {
            return res.status(404).json({ message: "No customers found to export." });
        }

        // Set Headers for ZIP Download
        const filename = `customers_export_${new Date().toISOString().split('T')[0]}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Stream the ZIP
        exportService.streamCustomersZip(res, customers);

    } catch (error) {
        console.error("Error exporting customers:", error);
        if (!res.headersSent) {
            res.status(500).json({ message: "Internal server error during export." });
        }
    }
});

/**
 * @swagger
 * /staff/customers/{id}:
 *   get:
 *     summary: Get detailed customer profile
 *     tags: [Staff]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Customer details
 */
router.get('/customers/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch User Basic Info + Latest Profile Data
        const userResult = await pool.query(`
            SELECT DISTINCT ON (c.id)
                c.*,
                l.mobile_number, l.state_of_residence, l.mda_tertiary as employer,
                l.bvn, l.nin, l.date_of_birth, l.primary_home_address,
                l.bank_name, l.account_number, l.account_name
            FROM customers c
            LEFT JOIN loans l ON c.id = l.customer_id
            WHERE c.id = $1
            ORDER BY c.id, l.created_at DESC
        `, [id]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: "Customer not found" });
        }

        const user = userResult.rows[0];

        // Fetch Loans
        const loansResult = await pool.query(`
            SELECT * FROM loans WHERE customer_id = $1 ORDER BY created_at DESC
        `, [id]);

        // Aggregate Documents from all loans (deduplicated by URL)
        const documents: { type: string; url: string; date: string }[] = [];
        const docTypes = ['govt_id_url', 'work_id_url', 'payslip_url', 'statement_of_account_url', 'proof_of_residence_url', 'selfie_verification_url'];
        const seenUrls = new Set();

        loansResult.rows.forEach((loan: any) => {
            docTypes.forEach(type => {
                if (loan[type] && !seenUrls.has(loan[type])) {
                    seenUrls.add(loan[type]);
                    documents.push({
                        type: type.replace('_url', '').replace(/_/g, ' ').toUpperCase(),
                        url: loan[type],
                        date: loan.created_at
                    });
                }
            });
        });

        res.json({
            profile: user,
            loans: loansResult.rows,
            documents
        });

    } catch (error) {
        console.error("Error fetching customer details:", error);
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
        const updatedUserResult = await pool.query(`
            UPDATE customers 
            SET role = $1
            WHERE id = $2
            RETURNING id, email, full_name, role
        `, [role, id]);

        if (updatedUserResult.rows.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        res.json({ message: "Role updated successfully.", user: updatedUserResult.rows[0] });
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
        const loans = await pool.query(`
            SELECT 
                l.id, l.applicant_full_name, l.requested_loan_amount, l.created_at, l.status, l.stage, l.product_type,
                l.surname, l.first_name, l.middle_name, -- Added individual name fields
                l.gender, l.date_of_birth, l.marital_status, l.religion, l.mothers_maiden_name, l.is_politically_exposed, l.title,
                l.mobile_number, l.personal_email, l.primary_home_address, l.residential_status, l.state_of_residence, l.state_of_origin,
                l.average_monthly_income, l.number_of_dependents, l.has_active_loans,
                l.mda_tertiary, l.ippis_number, l.staff_id,
                l.govt_id_url, l.statement_of_account_url, l.proof_of_residence_url, l.selfie_verification_url,
                l.work_id_url, l.payslip_url, -- Added missing docs
                l.customer_references, l.signatures, l.updated_at, l.eligible_amount, l.sales_officer_id,
                l.bvn, l.nin, -- Unmasked for editing
                l.apply_management_fee, l.apply_insurance_fee, l.disbursement_amount, -- Disbursement Logic
                l.existing_loan_balance, -- Added for Top-Up/Add-On/Re-App
                l.bank_name, l.account_number, l.loan_tenure_months, l.account_name, -- Added bank details
                l.loan_type, -- Added loan type
                
                -- New Fields for TopUp/BuyOver
                l.casa, l.topup_amount, l.buy_over_amount,
                l.buy_over_company_name, l.buy_over_company_account_name, l.buy_over_company_account_number,

                c.full_name as officer_name, c.email as officer_email, c.avatar_url as officer_avatar
            FROM loans l
            LEFT JOIN customers c ON l.sales_officer_id = c.id
            WHERE l.id = $1
            LIMIT 1
        `, [id]);

        if (loans.rows.length === 0) {
            return res.status(404).json({ message: "Loan not found" });
        }

        res.json(loans.rows[0]);
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
        const activities = await pool.query(`
            SELECT la.*, c.full_name as user_name, c.email as user_email, c.role as user_role, c.avatar_url
            FROM loan_activities la
            LEFT JOIN customers c ON la.user_id = c.id
            WHERE la.loan_id = $1
            ORDER BY la.created_at DESC
        `, [id]);
        res.json(activities.rows);
    } catch (error) {
        console.error("Error fetching activities:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /staff/loans/{id}:
 *   put:
 *     summary: Update a loan application (Edit Mode)
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
 *     responses:
 *       200:
 *         description: Loan application updated successfully
 *       403:
 *         description: Unauthorized
 */
router.put('/loans/:id', async (req, res) => {
    const { id } = req.params;
    // @ts-ignore
    const user = req.user as any;

    if (!user) return res.status(401).json({ message: "Unauthorized" });

    // Validate Permissions: Sales, CX, or SuperAdmin
    const allowedRoles = ['sales_officer', 'sales_manager', 'customer_experience', 'customer_service', 'super_admin', 'superadmin'];
    if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ message: "You do not have permission to edit applications." });
    }

    // Check current stage of loan to ensure it's editable
    const existingLoanResult = await pool.query('SELECT stage, personal_email FROM loans WHERE id = $1', [id]);
    const existingLoan = existingLoanResult.rows[0];

    if (!existingLoan) return res.status(404).json({ message: "Loan not found" });

    // Allow editing at Sales or Review (Customer Experience) stages
    const editableStages = ['sales', 'submitted', 'customer_experience'];
    if (!editableStages.includes(existingLoan.stage) && user.role !== 'super_admin') {
        return res.status(403).json({ message: `Cannot edit application in ${existingLoan.stage} stage.` });
    }

    const {
        // Identity
        title, surname, first_name, middle_name,
        gender, date_of_birth, religion, marital_status,
        mothers_maiden_name, mobile_number, personal_email, bvn, nin,

        // Address
        state_of_origin, state_of_residence, residential_status, primary_home_address,

        // Employment
        mda_tertiary, ippis_number, average_monthly_income,

        // Loan
        requested_loan_amount, loan_tenure_months, loan_type,

        // Documents (URLs) - Logic handled by frontend uploading first usually, but we accept updates here
        govt_id_url, statement_of_account_url, proof_of_residence_url, selfie_verification_url,
        work_id_url, payslip_url,

        // New Fields
        casa, topup_amount, buy_over_amount,
        buy_over_company_name, buy_over_company_account_name, buy_over_company_account_number,

        // References
        references
    } = req.body;

    try {
        // --- Validation Logic for Loan Types ---
        if (loan_type && loan_type !== 'new') {
            const missingFields: string[] = [];

            // Common Requirements for TopUp, Re-App, BuyOver
            if (['topup', 're-app', 'buy_over', 'add_on'].includes(loan_type)) {
                if (!ippis_number) missingFields.push('IPPIS Number');
                if (!mobile_number) missingFields.push('Mobile Number');
                if (!casa) missingFields.push('CASA Turnover');
                if (!payslip_url) missingFields.push('Recent Payslip');
            }

            // Specific to TopUp
            if (loan_type === 'topup' || loan_type === 'add_on') {
                if (!topup_amount) missingFields.push('TopUp Amount');
            }

            // Specific to Buy Over
            if (loan_type === 'buy_over') {
                if (!buy_over_amount) missingFields.push('Buy Over Amount');
                if (!buy_over_company_name) missingFields.push('Buy Over Company Name');
                if (!buy_over_company_account_name) missingFields.push('Buy Over Company Account Name');
                if (!buy_over_company_account_number) missingFields.push('Buy Over Company Account Number');
            }

            if (missingFields.length > 0) {
                return res.status(400).json({
                    message: `Missing required fields for ${loan_type.replace('_', ' ').toUpperCase()}: ${missingFields.join(', ')}`
                });
            }
        }
        // ---------------------------------------

        const applicant_full_name = `${surname} ${first_name} ${middle_name || ''}`.trim();

        await pool.query(
            `UPDATE loans
            SET 
                surname = $1, first_name = $2, middle_name = $3, applicant_full_name = $4,
                mobile_number = $5, personal_email = $6,
                title = $7, gender = $8, date_of_birth = $9, 
                religion = $10, marital_status = $11, mothers_maiden_name = $12,
                bvn = $13, nin = $14,
                state_of_origin = $15, state_of_residence = $16, 
                residential_status = $17, primary_home_address = $18,
                mda_tertiary = $19, ippis_number = $20, average_monthly_income = $21,
                requested_loan_amount = $22, loan_tenure_months = $23, loan_type = $24,
                govt_id_url = COALESCE($25, govt_id_url), 
                statement_of_account_url = COALESCE($26, statement_of_account_url), 
                proof_of_residence_url = COALESCE($27, proof_of_residence_url), 
                selfie_verification_url = COALESCE($28, selfie_verification_url),
                work_id_url = COALESCE($29, work_id_url), 
                payslip_url = COALESCE($30, payslip_url),
                customer_references = $31,
                
                casa = $32, topup_amount = $33, buy_over_amount = $34,
                buy_over_company_name = $35, buy_over_company_account_name = $36, buy_over_company_account_number = $37,

                updated_at = NOW()
            WHERE id = $38`,
            [
                surname, first_name, middle_name || null, applicant_full_name,
                mobile_number, personal_email || null,
                title || null, gender || null, date_of_birth || null,
                religion || null, marital_status || null, mothers_maiden_name || null,
                bvn || null, nin || null,
                state_of_origin || null, state_of_residence || null,
                residential_status || null, primary_home_address || null,
                mda_tertiary || null, ippis_number || null, average_monthly_income || 0,
                requested_loan_amount, loan_tenure_months || 6, loan_type || 'new',
                govt_id_url || null, statement_of_account_url || null,
                proof_of_residence_url || null, selfie_verification_url || null,
                work_id_url || null, payslip_url || null,
                references ? JSON.stringify(references) : null,

                casa || null, topup_amount || 0, buy_over_amount || 0,
                buy_over_company_name || null, buy_over_company_account_name || null, buy_over_company_account_number || null,

                id
            ]
        );

        // Check if email changed and log it
        if (existingLoan.personal_email !== personal_email) {
            await pool.query(
                `INSERT INTO loan_activities (loan_id, user_id, action_type, description, metadata)
                 VALUES ($1, $2, 'email_update', $3, $4)`,
                [
                    id, user.id,
                    `Email updated from ${existingLoan.personal_email} to ${personal_email}`,
                    JSON.stringify({ old_email: existingLoan.personal_email, new_email: personal_email, updatedBy: user.email })
                ]
            );
        }

        // Log General Edit Activity
        await pool.query(
            `INSERT INTO loan_activities (loan_id, user_id, action_type, description, metadata)
             VALUES ($1, $2, 'edit_application', 'Sales Officer edited application details', $3)`,
            [id, user.id, JSON.stringify({ updatedBy: user.email })]
        );

        // Real-time Update
        try {
            const io = getIO();
            // Emit the updated loan data (fetching it again might be cleaner, but for now we signal the update)
            io.emit('loan_updated', { id, stage: existingLoan.stage, status: 'unknown_update' });
            // Better: just emit the ID so clients re-fetch or we fetch fresh data here to emit.
            // For now, let's emit the ID and let clients refetch or assume attributes.
            // Actually, let's emit a specific event payload.
            io.emit('loan_updated', { id, type: 'edit', updatedBy: user.email });
        } catch (error) {
            console.error("Socket emit failed:", error);
        }

        res.json({ message: "Loan application updated successfully" });

    } catch (error) {
        console.error("Error updating loan:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /staff/loans/{id}/reveal:
 *   post:
 *     summary: Reveal sensitive data for a loan and log the action
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
 *             required: [field]
 *             properties:
 *               field:
 *                 type: string
 *                 enum: [bvn, nin]
 *     responses:
 *       200:
 *         description: Revealed data
 *       403:
 *         description: Unauthorized
 */
router.post('/loans/:id/reveal', async (req, res) => {
    const { id } = req.params;
    const { field } = req.body;
    // @ts-ignore
    const user = req.user as any;

    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (!['bvn', 'nin'].includes(field)) {
        return res.status(400).json({ message: "Invalid field requested." });
    }

    try {
        // Fetch specific field
        // Note: We use string interpolation here SAFELY because field is strictly validated against allowlist above
        const loanResult = await pool.query(`SELECT ${field} FROM loans WHERE id = $1`, [id]);
        const loan = loanResult.rows[0];

        if (!loan) return res.status(404).json({ message: "Loan not found" });

        // Log Activity
        try {
            await pool.query(
                `INSERT INTO loan_activities (loan_id, user_id, action_type, description, metadata)
                 VALUES ($1, $2, 'view_sensitive_data', $3, $4)`,
                [
                    id, user.id,
                    `Viewed ${field.toUpperCase()}`,
                    JSON.stringify({ field })
                ]
            );
        } catch (logError) {
            console.error("Failed to log view activity:", logError);
        }

        res.json({ value: loan[field] });

    } catch (error) {
        console.error(`Error revealing ${field}:`, error);
        res.status(500).json({ message: "Internal server error" });
    }
});

router.get('/loans/:id/documents', async (req, res) => {
    const { id } = req.params;
    try {
        const documents = await pool.query(`
            SELECT ld.*, c.full_name as uploaded_by_name
            FROM loan_documents ld
            LEFT JOIN customers c ON ld.uploaded_by_user_id = c.id
            WHERE ld.loan_id = $1
            ORDER BY ld.created_at DESC
        `, [id]);
        res.json(documents.rows);
    } catch (error) {
        console.error("Error fetching documents:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

router.get('/loans/:id/comments', async (req, res) => {
    const { id } = req.params;
    try {
        const comments = await pool.query(`
            SELECT lc.*, u.full_name as user_name, u.role as user_role, u.avatar_url
            FROM loan_comments lc
            LEFT JOIN customers u ON lc.user_id = u.id
            WHERE lc.loan_id = $1
            ORDER BY lc.created_at DESC
        `, [id]);
        res.json(comments.rows);
    } catch (error) {
        console.error("Error fetching comments:", error);
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
    const { action, data, reason } = req.body; // data may contain eligible_amount, tenure, target_stage, fees
    // @ts-ignore
    const user = req.user as any;

    if (!user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const loanResult = await pool.query('SELECT * FROM loans WHERE id = $1 LIMIT 1', [id]);
        const loan = loanResult.rows[0];
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

        const STAGE_ORDER = ['submitted', 'sales', 'customer_experience', 'credit_check_1', 'credit_check_2', 'internal_audit', 'finance', 'disbursed'];
        let nextStage = '';
        const updates: string[] = ["stage = $1", "updated_at = NOW()"];
        const values: any[] = [];
        let paramIndex = 2; // Start at 2 because $1 is reserved for nextStage

        // Helper to validate return target
        const getReturnStage = (defaultReturn: string) => {
            if (action === 'return' && data?.target_stage) {
                const currentIndex = STAGE_ORDER.indexOf(currentStage === 'credit_check' ? 'credit_check_1' : currentStage);
                const targetIndex = STAGE_ORDER.indexOf(data.target_stage);

                // Allow return only to previous stages
                if (targetIndex !== -1 && targetIndex < currentIndex) {
                    return data.target_stage;
                }
            }
            return defaultReturn;
        };

        // --- STAGE TRANSITION LOGIC ---

        // 0. Sales -> Customer Experience (Review)
        if (currentStage === 'sales') {
            if (!canAct(['sales_officer', 'sales_manager'], 'sales')) {
                return res.status(403).json({ message: "Only Sales Officers/Managers can process Sales stage" });
            }
            if (action === 'approve') nextStage = 'customer_experience';
        }

        // 1. Customer Experience -> Credit Check 1
        else if (currentStage === 'submitted' || currentStage === 'customer_experience') {
            // Updated Logic: Sales Officers/Managers can NO LONGER act on this stage. Only CX/CS.
            if (!canAct(['customer_experience', 'customer_service'], currentStage)) {

                // Determine if we should allow 'submitted' to be picked up by CX
                // For now, treat 'submitted' same as 'customer_experience' active work
                if (!canAct(['customer_experience', 'customer_service'], 'customer_experience') && currentStage !== 'submitted') {
                    return res.status(403).json({ message: `Role ${user.role} cannot act on stage ${currentStage}` });
                }
            }
            if (action === 'approve') nextStage = 'credit_check_1';
            if (action === 'return') nextStage = getReturnStage('sales');
        }

        // 2. Credit Check 1 (Credit Officer) -> Credit Check 2 (Credit Manager)
        else if (currentStage === 'credit_check_1') {
            if (!canAct('credit_officer', 'credit_check_1')) {
                return res.status(403).json({ message: "Only Credit Officers can process Credit Check 1" });
            }
            if (action === 'approve') {
                if (data?.eligible_amount) {
                    updates.push(`eligible_amount = $${paramIndex++}`);
                    values.push(parseFloat(data.eligible_amount));
                }
                if (data?.tenure) {
                    updates.push(`loan_tenure_months = $${paramIndex++}`);
                    values.push(parseInt(data.tenure));
                }
                // Save Disbursement Logic
                if (data.apply_management_fee !== undefined) {
                    updates.push(`apply_management_fee = $${paramIndex++}`);
                    values.push(data.apply_management_fee);
                }
                if (data.apply_insurance_fee !== undefined) {
                    updates.push(`apply_insurance_fee = $${paramIndex++}`);
                    values.push(data.apply_insurance_fee);
                }
                if (data.disbursement_amount !== undefined) {
                    updates.push(`disbursement_amount = $${paramIndex++}`);
                    values.push(data.disbursement_amount);
                }
                if (data.existing_loan_balance !== undefined) {
                    updates.push(`existing_loan_balance = $${paramIndex++}`);
                    values.push(parseFloat(data.existing_loan_balance));
                }
                nextStage = 'credit_check_2';
            }
            if (action === 'return') nextStage = getReturnStage('customer_experience');
        }

        // 3. Credit Check 2 (Credit Manager) -> Internal Audit
        else if (currentStage === 'credit_check_2') {
            if (!canAct('credit_manager', 'credit_check_2')) {
                return res.status(403).json({ message: "Only Credit Managers can process Credit Check 2" });
            }

            if (action === 'approve') {
                if (!data?.eligible_amount && !loan.eligible_amount) {
                    return res.status(400).json({ message: "Eligible amount is required for approval." });
                }
                if (data?.eligible_amount) {
                    updates.push(`eligible_amount = $${paramIndex++}`);
                    values.push(parseFloat(data.eligible_amount));
                }
                if (data?.tenure) {
                    updates.push(`loan_tenure_months = $${paramIndex++}`);
                    values.push(parseInt(data.tenure));
                }
                // Save Disbursement Logic
                if (data.apply_management_fee !== undefined) {
                    updates.push(`apply_management_fee = $${paramIndex++}`);
                    values.push(data.apply_management_fee);
                }
                if (data.apply_insurance_fee !== undefined) {
                    updates.push(`apply_insurance_fee = $${paramIndex++}`);
                    values.push(data.apply_insurance_fee);
                }
                if (data.disbursement_amount !== undefined) {
                    updates.push(`disbursement_amount = $${paramIndex++}`);
                    values.push(data.disbursement_amount);
                }
                if (data.existing_loan_balance !== undefined) {
                    updates.push(`existing_loan_balance = $${paramIndex++}`);
                    values.push(parseFloat(data.existing_loan_balance));
                }

                nextStage = 'internal_audit';
            }
            if (action === 'return') nextStage = getReturnStage('credit_check_1');
        }

        // 4. Internal Audit -> Finance
        else if (currentStage === 'internal_audit') {
            if (!canAct('internal_audit', 'internal_audit')) {
                return res.status(403).json({ message: "Only Internal Audit can process this stage" });
            }
            if (action === 'approve') nextStage = 'finance';
            if (action === 'return') nextStage = getReturnStage('credit_check_2');
        }

        // 5. Finance -> Disbursed
        else if (currentStage === 'finance') {
            if (!canAct('finance', 'finance')) {
                return res.status(403).json({ message: "Only Finance can process this stage" });
            }
            if (action === 'approve') {
                nextStage = 'disbursed';
                updates.push(`status = $${paramIndex++}`); // Final status
                values.push('approved');
            }
            if (action === 'return') nextStage = getReturnStage('internal_audit');
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
                await pool.query(`
                    UPDATE loans
                    SET status = 'rejected', stage = 'rejected', updated_at = NOW()
                    WHERE id = $1
                `, [id]);
            } else {
                values.unshift(nextStage); // Add nextStage as the first value for $1
                values.push(id); // Add id as the last value

                const query = `UPDATE loans SET ${updates.join(', ')} WHERE id = $${paramIndex}`; // Use paramIndex for the ID

                await pool.query(query, values);
            }

            // --- LOG ACTIVITY ---
            try {
                const activityDescription = action === 'reject'
                    ? `Application rejected at ${currentStage.replace(/_/g, ' ')}`
                    : `Moved application from ${currentStage.replace(/_/g, ' ')} to ${nextStage.replace(/_/g, ' ')}`;


                // Log Activity
                await pool.query(
                    `INSERT INTO loan_activities (loan_id, user_id, action_type, description, metadata)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [
                        id, user.id, action, activityDescription,
                        JSON.stringify({ from: currentStage, to: nextStage || 'rejected', ...data }) // Use data for metadata
                    ]
                );

                if (reason) {
                    await pool.query(
                        `INSERT INTO loan_comments (loan_id, user_id, comment)
                         VALUES ($1, $2, $3)`,
                        [id, user.id, reason]
                    );
                }

                // --- SEND EMAIL NOTIFICATIONS ---

                // NEW LOGIC: Notify assigned Sales Officer on specific events
                const shouldNotifySales = (
                    (nextStage === 'credit_check_2') ||
                    (nextStage === 'disbursed') ||
                    (nextStage === 'sales') || // If returned to sales
                    (action === 'reject')
                );

                if (shouldNotifySales && loan.sales_officer_id) {
                    const officerResult = await pool.query('SELECT email FROM customers WHERE id = $1', [loan.sales_officer_id]);
                    const officer = officerResult.rows[0];
                    if (officer && officer.email) {
                        const stageForEmail = action === 'reject' ? 'rejected' : nextStage;
                        await resendService.sendStageNotification([officer.email], id, stageForEmail);
                        console.log(`Notification sent to Assigned Sales Officer (${officer.email}) regarding ${stageForEmail}`);
                    }
                }

            } catch (logError) {
                console.error("Failed to log activity or send email:", logError);
                // Non-blocking error
            }

            // Real-time Update
            try {
                const io = getIO();
                io.emit('loan_updated', {
                    id: Number(id),
                    stage: nextStage || 'rejected',
                    status: (action === 'reject' ? 'rejected' : 'approved'), // Status should be derived from action or nextStage
                    updatedBy: user.email,
                    timestamp: new Date()
                });
            } catch (e) {
                console.error("Socket emit failed:", e);
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
        const userResult = await pool.query('SELECT password_hash FROM customers WHERE id = $1', [user.id]);
        const currentUser = userResult.rows[0];

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
        await pool.query(
            'UPDATE customers SET password_hash = $1 WHERE id = $2',
            [newHashedPassword, user.id]
        );

        res.json({ message: "Password updated successfully." });

    } catch (error) {
        console.error("Error changing password:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /staff/loans/application:
 *   post:
 *     summary: Create a loan application on behalf of a customer
 *     tags: [Staff]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [applicant_full_name, mobile_number, requested_loan_amount]
 *     responses:
 *       201:
 *         description: Loan application created successfully
 *       400:
 *         description: Missing required fields
 */
router.post('/loans/application', async (req, res) => {
    // @ts-ignore
    const officer = req.user as any;
    if (!officer) return res.status(401).json({ message: "Unauthorized" });

    const {
        // Identity
        title, surname, first_name, middle_name,
        gender, date_of_birth, religion, marital_status,
        mothers_maiden_name, mobile_number, personal_email, bvn, nin,

        // Address
        state_of_origin, state_of_residence, residential_status, primary_home_address,

        // Employment
        mda_tertiary, ippis_number, staff_id, average_monthly_income,

        // Loan
        requested_loan_amount, loan_tenure_months, loan_type,

        // Bank Details
        bank_name, account_number, account_name,

        // Documents
        work_id_url, payslip_url,
        // (Optional legacy fields if sent)
        govt_id_url, statement_of_account_url, proof_of_residence_url, selfie_verification_url,

        // References
        references
    } = req.body;

    // Validate Mandatory Fields
    if (!surname || !first_name || !mobile_number || (!requested_loan_amount && !req.body.topup_amount && !req.body.buy_over_amount)) {
        return res.status(400).json({ message: "Surname, First Name, Mobile, and Amount are required." });
    }

    // Validate Mandatory Documents (Conditional)
    const isSpecialLoan = ['topup', 'buy_over', 're-app', 'add_on'].includes(loan_type);

    if (!isSpecialLoan) {
        if (!govt_id_url || !work_id_url || !payslip_url) {
            return res.status(400).json({ message: "Govt ID, Work ID, and Payslip are mandatory." });
        }
    } else {
        // For special loans, only Payslip might be required (as per user request "recent payslip upload")
        if (!payslip_url) {
            return res.status(400).json({ message: "Recent Payslip is mandatory." });
        }
    }

    try {
        // Construct Full Name for Backward Compatibility
        const applicant_full_name = `${surname} ${first_name} ${middle_name || ''}`.trim();

        // 1. Customer Resolution
        let customerId;
        const emailToUse = personal_email || `${mobile_number}@placeholder.nolt`;

        // Check if customer exists by email
        const existingCustomerResult = await pool.query('SELECT id FROM customers WHERE email = $1 LIMIT 1', [emailToUse]);
        if (existingCustomerResult.rows.length > 0) {
            customerId = existingCustomerResult.rows[0].id;
        } else {
            // Create new customer
            const tempPassword = Math.random().toString(36).slice(-8);
            const hashedPassword = await bcrypt.hash(tempPassword, 10);

            const newCustomerResult = await pool.query(
                `INSERT INTO customers (
                    email, full_name, role, is_active, new_comer, password_hash, google_id
                ) VALUES (
                    $1, $2, 'customer', true, true, $3, null
                )
                RETURNING id`,
                [emailToUse, applicant_full_name, hashedPassword]
            );
            customerId = newCustomerResult.rows[0].id;
        }

        // 2. Create Loan
        const newLoanResult = await pool.query(
            `INSERT INTO loans (
                customer_id, sales_officer_id,
                surname, first_name, middle_name, applicant_full_name,
                mobile_number, personal_email,
                title, gender, date_of_birth, religion, marital_status, mothers_maiden_name,
                bvn, nin,
                state_of_origin, state_of_residence, residential_status, primary_home_address,
                mda_tertiary, ippis_number, staff_id, average_monthly_income,
                requested_loan_amount, loan_tenure_months, loan_type,
                bank_name, account_number, account_name,
                govt_id_url, statement_of_account_url, proof_of_residence_url, selfie_verification_url,
                work_id_url, payslip_url,
                customer_references,
                status, stage,
                casa, topup_amount, buy_over_amount,
                buy_over_company_name, buy_over_company_account_name, buy_over_company_account_number
            ) VALUES (
                $1, $2,
                $3, $4, $5, $6,
                $7, $8,
                $9, $10, $11, $12, $13, $14,
                $15, $16,
                $17, $18, $19, $20,
                $21, $22, $23, $24,
                $25, $26, $27,
                $28, $29, $30,
                $31, $32, $33, $34,
                $35, $36,
                $37,
                'pending', 'sales',
                $38, $39, $40,
                $41, $42, $43
            )
            RETURNING id`,
            [
                customerId, officer.id,
                surname, first_name, middle_name || null, applicant_full_name,
                mobile_number, personal_email || null,
                title || null, gender || null, date_of_birth || null, religion || null, marital_status || null, mothers_maiden_name || null,
                bvn || null, nin || null,
                state_of_origin || null, state_of_residence || null, residential_status || null, primary_home_address || null,
                mda_tertiary || null, ippis_number || null, staff_id || null, average_monthly_income || 0,
                requested_loan_amount || 0, loan_tenure_months || 6, loan_type || 'new',
                bank_name || null, account_number || null, account_name || null,
                govt_id_url || null, statement_of_account_url || null, proof_of_residence_url || null, selfie_verification_url || null,
                work_id_url || null, payslip_url || null,
                references ? JSON.stringify(references) : null,
                req.body.casa || null,
                req.body.topup_amount || 0,
                req.body.buy_over_amount || 0,
                req.body.buy_over_company_name || null,
                req.body.buy_over_company_account_name || null,
                req.body.buy_over_company_account_number || null
            ]
        );
        const loan = newLoanResult.rows[0];

        // 3. Log Activity
        await pool.query(
            `INSERT INTO loan_activities (loan_id, user_id, action_type, description, metadata)
             VALUES ($1, $2, 'create_application', 'Sales Officer created application', $3)`,
            [loan.id, officer.id, JSON.stringify({ customerId })]
        );

        res.status(201).json({ message: "Loan application created successfully", loanId: loan.id });

    } catch (error) {
        console.error("Error creating loan application:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /staff/loans/{id}/assign:
 *   patch:
 *     summary: Reassign a loan to another sales officer
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
 *             required: [sales_officer_id]
 *     responses:
 *       200:
 *         description: Loan reassigned successfully
 */
router.patch('/loans/:id/assign', async (req, res) => {
    const { id } = req.params;
    const { sales_officer_id } = req.body;
    // @ts-ignore
    const user = req.user as any;

    if (!user) return res.status(401).json({ message: "Unauthorized" });

    // Permission Check: Sales Manager, Admin, Super Admin
    const allowedRoles = ['sales_manager', 'admin', 'super_admin', 'superadmin'];
    if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ message: "Only Managers and Admins can reassign loans." });
    }

    if (!sales_officer_id) {
        return res.status(400).json({ message: "Target Sales Officer ID is required." });
    }

    try {
        const loanResult = await pool.query('SELECT sales_officer_id FROM loans WHERE id = $1', [id]);
        const loan = loanResult.rows[0];
        if (!loan) return res.status(404).json({ message: "Loan not found" });

        const officerResult = await pool.query('SELECT id, email, full_name FROM customers WHERE id = $1', [sales_officer_id]);
        const newOfficer = officerResult.rows[0];
        if (!newOfficer) return res.status(404).json({ message: "Target officer not found." });

        if (loan.sales_officer_id === sales_officer_id) {
            return res.json({ message: "Loan is already assigned to this officer." });
        }

        // Update Assignment
        await pool.query(
            'UPDATE loans SET sales_officer_id = $1, updated_at = NOW() WHERE id = $2',
            [sales_officer_id, id]
        );

        // Log Activity
        await pool.query(
            `INSERT INTO loan_activities (loan_id, user_id, action_type, description, metadata)
             VALUES ($1, $2, 'reassign_officer', $3, $4)`,
            [
                id, user.id,
                `Reassigned to ${newOfficer.full_name}`,
                JSON.stringify({ from: loan.sales_officer_id, to: sales_officer_id, updatedBy: user.email })
            ]
        );

        // Notify New Officer
        try {
            await resendService.sendStageNotification([newOfficer.email], id, 'assigned');
            console.log(`Notification sent to New Sales Officer (${newOfficer.email})`);
        } catch (emailError) {
            console.warn("Failed to send assignment email:", emailError);
        }

        res.json({ message: `Loan reassigned to ${newOfficer.full_name}` });

    } catch (error) {
        console.error("Error reassigning loan:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /staff/loans/{id}/attribute:
 *   patch:
 *     summary: Update a specific attribute of a loan
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
 *             required: [field, value]
 *             properties:
 *               field:
 *                 type: string
 *                 enum: [loan_type]
 *               value:
 *                 type: string
 *     responses:
 *       200:
 *         description: Attribute updated successfully
 */
router.patch('/loans/:id/attribute', async (req, res) => {
    const { id } = req.params;
    const { field, value } = req.body;
    // @ts-ignore
    const user = req.user as any;

    if (!user) return res.status(401).json({ message: "Unauthorized" });

    // Allowed fields for partial update
    const allowedFields = ['loan_type'];
    if (!allowedFields.includes(field)) {
        return res.status(400).json({ message: "Invalid field for partial update." });
    }

    try {
        const loanResult = await pool.query('SELECT stage FROM loans WHERE id = $1', [id]);
        const loan = loanResult.rows[0];
        if (!loan) return res.status(404).json({ message: "Loan not found" });

        // Permission Check: Sales Officer/Manager during 'sales' or 'submitted'
        const canEdit = (
            ['sales', 'submitted'].includes(loan.stage) &&
            ['sales_officer', 'sales_manager', 'super_admin', 'superadmin'].includes(user.role)
        );

        if (!canEdit) {
            return res.status(403).json({ message: "You cannot edit this field at this stage." });
        }

        // Update Field - Safe string interpolation because field is validated against allowlist
        await pool.query(
            `UPDATE loans SET ${field} = $1, updated_at = NOW() WHERE id = $2`,
            [value, id]
        );

        // Log Activity
        await pool.query(
            `INSERT INTO loan_activities (loan_id, user_id, action_type, description, metadata)
             VALUES ($1, $2, 'update_attribute', $3, $4)`,
            [
                id, user.id,
                `Updated ${field} to ${value}`,
                JSON.stringify({ field, value, updatedBy: user.email })
            ]
        );

        res.json({ message: "Updated successfully" });

    } catch (error) {
        console.error(`Error updating ${field}:`, error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/staff/reports:
 *   get:
 *     summary: Get loan reports (approved/rejected)
 *     tags: [Staff]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status (approved, rejected, all)
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: List of loans for report
 */
router.get('/reports', async (req, res) => {
    try {
        const { status, stage, startDate, endDate, page = 1, limit = 10 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        // Build Filters
        const filters: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (status && status !== 'all') {
            filters.push(`l.status = $${paramIndex++}`);
            values.push(status);
        }

        if (stage && stage !== 'all') {
            filters.push(`l.stage = $${paramIndex++}`);
            values.push(stage);
        }

        // Date Filters
        if (typeof startDate === 'string' && startDate) {
            filters.push(`l.created_at >= $${paramIndex++}`);
            values.push(startDate);
        }
        if (typeof endDate === 'string' && endDate) {
            filters.push(`l.created_at <= $${paramIndex++}::date + interval '1 day'`);
            values.push(endDate);
        }

        const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

        // Main Query with Pagination
        const reportsQuery = `
            SELECT
                l.applicant_full_name,
                l.mda_tertiary,
                l.eligible_amount, -- Approved Amount
                l.requested_loan_amount,
                l.average_monthly_income, -- Net Salary (proxy)
                l.account_number,
                l.bank_name,
                l.loan_tenure_months,
                l.product_type,
                -- Branch is missing in DB
                c.full_name as officer_name,
                l.loan_type,
                l.ippis_number,
                l.staff_id,
                l.mobile_number,
                l.topup_amount, -- Added Field for Special Loans
                l.disbursement_amount, -- Added Field
                l.status, l.stage, l.created_at, l.updated_at
            FROM loans l
            LEFT JOIN customers c ON l.sales_officer_id = c.id
            ${whereClause}
            ORDER BY l.created_at DESC
            LIMIT $${paramIndex++} OFFSET $${paramIndex++}
        `;

        const queryValues = [...values, limit, offset];

        // Count Query
        const countQuery = `
            SELECT COUNT(l.id) as total
            FROM loans l
            LEFT JOIN customers c ON l.sales_officer_id = c.id
            ${whereClause}
        `;

        const countValues = [...values];


        const reportsResult = await pool.query(reportsQuery, queryValues);
        const countResult = await pool.query(countQuery, countValues);

        res.json({
            reports: reportsResult.rows,
            total: Number(countResult.rows[0].total),
            page: Number(page),
            limit: Number(limit)
        });
    } catch (error) {
        console.error("Error fetching reports:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /staff/loans/bulk-approve:
 *   post:
 *     summary: Bulk approve loans in finance stage
 *     tags: [Staff]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [loanIds]
 *             properties:
 *               loanIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Loans approved successfully
 */
router.post('/loans/bulk-approve', async (req, res) => {
    // @ts-ignore
    const user = req.user as any;
    const { loanIds } = req.body;

    if (!user) return res.status(401).json({ message: "Unauthorized" });

    // Permission Check: Finance, Admin, Super Admin
    const allowedRoles = ['finance', 'admin', 'super_admin', 'superadmin'];
    if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ message: "Only Finance and Admins can bulk approve." });
    }

    if (!loanIds || !Array.isArray(loanIds) || loanIds.length === 0) {
        return res.status(400).json({ message: "Invalid or empty loanIds." });
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const processedIds: number[] = [];
            const failedIds: number[] = [];

            // Fetch eligible loans
            const loansResult = await client.query(
                'SELECT id, sales_officer_id, stage FROM loans WHERE id = ANY($1)',
                [loanIds]
            );
            const loans = loansResult.rows;

            for (const loan of loans) {
                // Verify stage
                if (loan.stage !== 'finance') {
                    failedIds.push(loan.id);
                    continue;
                }

                // Update Loan
                await client.query(
                    `UPDATE loans 
                     SET stage = 'disbursed', status = 'approved', updated_at = NOW() 
                     WHERE id = $1`,
                    [loan.id]
                );

                // Log Activity
                await client.query(
                    `INSERT INTO loan_activities (loan_id, user_id, action_type, description, metadata)
                     VALUES ($1, $2, 'bulk_approve', 'Bulk approved by Finance', $3)`,
                    [loan.id, user.id, JSON.stringify({ from: 'finance', to: 'disbursed', by: user.email })]
                );

                // Notify Sales Officer
                if (loan.sales_officer_id) {
                    try {
                        const officerResult = await client.query('SELECT email FROM customers WHERE id = $1', [loan.sales_officer_id]);
                        const officer = officerResult.rows[0];
                        if (officer && officer.email) {
                            // Use service but do not await to avoid slowing down transaction? 
                            // Better to await to ensure reliable sending or acknowledge failure?
                            // Actually, sending email inside transaction loop might be slow.
                            // Let's collect emails and send after commit? 
                            // For now, simple implementation.
                            // We can't use resendService directly inside transaction easily without holding connection.
                            // Let's just fire and forget or await. Await is safer for flow control.
                            await resendService.sendStageNotification([officer.email], loan.id, 'disbursed');
                        }
                    } catch (emailError) {
                        console.warn(`Failed to notify officer for loan ${loan.id}`, emailError);
                    }
                }

                processedIds.push(loan.id);
            }

            await client.query('COMMIT');

            res.json({
                message: `Processed ${processedIds.length} loans.`,
                processedIds,
                failedIds // Loans that were not in finance stage
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error("Error in bulk approval:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


// Helper to get all assigned loans for a staff
router.get('/assigned-loans', async (req, res) => {
    // @ts-ignore
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    try {
        // Fetch loans assigned to this user
        // Used for officers to see their own portfolio quickly
        const loansResult = await pool.query(
            `SELECT * FROM loans 
             WHERE sales_officer_id = $1 
             ORDER BY created_at DESC`,
            [user.id]
        );
        res.json(loansResult.rows);
    } catch (error) {
        console.error("Error fetching assigned loans:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
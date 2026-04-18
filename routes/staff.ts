import { Router } from 'express';
import pool from '../config/db.js';
import { zeptoService } from '../services/zeptoService.js';
import { exportService } from '../services/exportService.js';
import bcrypt from 'bcrypt';
import multer from 'multer';
import { pdfService } from '../services/pdfService.js';

import { getIO } from '../socket.js';

// In-memory multer for CSV bulk upload
const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are accepted'));
        }
    }
});

/** Simple CSV parser — handles quoted fields */
function parseCsv(raw: string): Record<string, string>[] {
    const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.every(c => !c)) continue;
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = cols[idx] ?? ''; });
        rows.push(row);
    }
    return rows;
}

/** Generates an alphanumeric temp password like "Ab3Kp9Xz" */
function generatePassword(length = 10): string {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const router = Router();

// Middleware to check if user is a Superadmin
const isSuperAdmin = (req: any, res: any, next: any) => {
    if (req.isAuthenticated() && (req.user.role === 'super_admin' || req.user.role === 'superadmin')) {
        return next();
    }
    return res.status(403).json({ message: "Access denied. Superadmin only." });
};

// Middleware to check if user is an authenticated staff
const isStaff = (req: any, res: any, next: any) => {
    if (req.isAuthenticated() && req.user.role !== 'customer') {
        return next();
    }
    return res.status(401).json({ message: "Unauthorized. Staff access required." });
};

// Middleware to ensure user is logged in
const isAuthenticated = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: "Unauthorized. Please login first." });
};

interface AuthRequest extends Request {
    user?: any;
}
import { Request, Response } from 'express';

/**
 * @swagger
 * /api/staff/invite:
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
            await zeptoService.sendWelcomeEmail(email, full_name, tempPassword);
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
 * /api/staff/bulk-invite:
 *   post:
 *     summary: Bulk-create staff users from a CSV file
 *     tags: [Staff]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: CSV file with columns "full_name" and "email"
 *     responses:
 *       200:
 *         description: Bulk invite result with per-row success/failure details
 *       400:
 *         description: No file or invalid CSV
 *       403:
 *         description: Superadmin only
 */
router.post('/bulk-invite', isSuperAdmin, csvUpload.single('file'), async (req: any, res: any) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No CSV file uploaded. Use field name "file".' });
    }

    const rawCsv = req.file.buffer.toString('utf-8');
    const rows = parseCsv(rawCsv);

    if (rows.length === 0) {
        return res.status(400).json({ message: 'CSV is empty or has no data rows. Required columns: full_name, email' });
    }

    // Validate required columns exist
    const firstRow = rows[0];
    if (!('full_name' in firstRow) || !('email' in firstRow)) {
        return res.status(400).json({
            message: 'CSV must have "full_name" and "email" columns (case-insensitive).'
        });
    }

    const results: {
        row: number;
        email: string;
        full_name: string;
        status: 'created' | 'skipped' | 'failed';
        reason?: string;
        email_sent?: boolean;
    }[] = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const email = (row['email'] || '').trim().toLowerCase();
        const full_name = (row['full_name'] || '').trim();

        if (!email || !full_name) {
            results.push({ row: i + 2, email, full_name, status: 'skipped', reason: 'Missing email or full_name' });
            continue;
        }

        // Basic email format check
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            results.push({ row: i + 2, email, full_name, status: 'skipped', reason: 'Invalid email format' });
            continue;
        }

        try {
            // Check for duplicates
            const existing = await pool.query('SELECT id FROM customers WHERE email = $1 LIMIT 1', [email]);
            if (existing.rows.length > 0) {
                results.push({ row: i + 2, email, full_name, status: 'skipped', reason: 'Email already exists' });
                continue;
            }

            // Generate & hash password
            const tempPassword = generatePassword(10);
            const hashedPassword = await bcrypt.hash(tempPassword, 10);

            // Insert — role is NULL until manually assigned
            await pool.query(
                `INSERT INTO customers (email, full_name, password_hash, role, is_active, new_comer)
                 VALUES ($1, $2, $3, NULL, TRUE, TRUE)`,
                [email, full_name, hashedPassword]
            );

            // Send welcome email with credentials
            let emailSent = false;
            try {
                await zeptoService.sendWelcomeEmail(email, full_name, tempPassword);
                emailSent = true;
            } catch (emailErr) {
                console.error(`[BulkInvite] Failed to send email to ${email}:`, emailErr);
            }

            results.push({ row: i + 2, email, full_name, status: 'created', email_sent: emailSent });

        } catch (err: any) {
            console.error(`[BulkInvite] Error processing row ${i + 2}:`, err);
            results.push({ row: i + 2, email, full_name, status: 'failed', reason: err?.message || 'Database error' });
        }
    }

    const created = results.filter(r => r.status === 'created').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const failed = results.filter(r => r.status === 'failed').length;

    return res.json({
        message: `Bulk invite complete. Created: ${created}, Skipped: ${skipped}, Failed: ${failed}.`,
        summary: { total: rows.length, created, skipped, failed },
        results
    });
});

/**
 * @swagger
 * /api/staff/revoke-access:
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
 * /api/staff/loans/timeline-report:
 *   get:
 *     summary: Get timeline report of loan stages for Customer Experience
 *     tags: [Staff]
 *     responses:
 *       200:
 *         description: Paginated timeline report
 */
router.get('/loans/timeline-report', async (req, res) => {
    // @ts-ignore
    const user = req.user as any;
    if (!user || (user.role !== 'customer_experience' && user.role !== 'super_admin' && user.role !== 'superadmin')) {
        return res.status(403).json({ message: "Forbidden. Only Customer Experience and Super Admins can access." });
    }

    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let baseQuery = `
            SELECT l.id, l.applicant_full_name, l.requested_loan_amount, l.loan_type, l.product_type, l.status, l.stage, c.full_name as officer_name
            FROM loans l
            LEFT JOIN customers c ON l.sales_officer_id = c.id
        `;
        const filters: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (search) {
            filters.push(`(l.applicant_full_name ILIKE $${paramIndex} OR CAST(l.id AS TEXT) ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (filters.length > 0) {
            baseQuery += ` WHERE ` + filters.join(' AND ');
        }

        baseQuery += ` ORDER BY l.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(limit, offset);

        const loansResult = await pool.query(baseQuery, params);
        const loans = loansResult.rows;

        if (loans.length === 0) {
            return res.json({
                data: [],
                meta: { total: 0, page: Number(page), limit: Number(limit) }
            });
        }

        let countQuery = `SELECT COUNT(*) FROM loans`;
        const countParams: any[] = [];
        if (filters.length > 0) {
            countQuery += ` WHERE ` + filters.join(' AND ');
            countParams.push(`%${search}%`);
        }
        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count, 10);

        const loanIds = loans.map((l: any) => l.id);
        const placeHolders = loanIds.map((_: any, i: number) => `$${i + 1}`).join(',');

        const activitiesResult = await pool.query(`
            SELECT loan_id, action_type, created_at, metadata, description
            FROM loan_activities
            WHERE loan_id IN (${placeHolders})
            ORDER BY created_at ASC
        `, loanIds);

        const activitiesByLoan = activitiesResult.rows.reduce((acc: any, act: any) => {
            if (!acc[act.loan_id]) acc[act.loan_id] = [];
            acc[act.loan_id].push(act);
            return acc;
        }, {});

        const reportData: any[] = [];
        const now = new Date();

        for (const loan of loans) {
            const acts = activitiesByLoan[loan.id] || [];

            let currentStageName = 'sales';
            let currentStageEntry: Date | null = null;
            let timeline: any[] = [];

            const pushStage = (stageName: string, entry: Date, exit: Date | null, finalNodeAction?: string, returnReason?: string) => {
                const endTime = exit || now;
                const tatHours = (endTime.getTime() - entry.getTime()) / (1000 * 60 * 60);

                let formattedStageName = stageName.replace(/_/g, ' ');
                formattedStageName = formattedStageName.charAt(0).toUpperCase() + formattedStageName.slice(1);

                timeline.push({
                    loanId: loan.id,
                    loanType: loan.loan_type === 'new' ? 'New Loan' : loan.loan_type === 'topup' ? 'Top-Up' : loan.loan_type === 'buy_over' ? 'Buy Over' : loan.loan_type,
                    productType: loan.product_type || 'Public Sector Loan',
                    amount: loan.requested_loan_amount,
                    currentStatus: loan.status,
                    initiator: loan.applicant_full_name,
                    officerName: loan.officer_name || '-',
                    stageName: formattedStageName,
                    entryTimestamp: entry.toISOString(),
                    exitTimestamp: exit ? exit.toISOString() : null,
                    tatHours: tatHours.toFixed(2),
                    finalNode: finalNodeAction,
                    returnReason: returnReason
                });
            };

            for (const act of acts) {
                const actDate = new Date(act.created_at);

                if (act.action_type === 'create_application') {
                    currentStageEntry = actDate;
                    currentStageName = 'sales';
                } else if (['approve', 'return', 'reject'].includes(act.action_type)) {
                    if (!currentStageEntry) currentStageEntry = actDate;

                    let meta = null;
                    try {
                        meta = typeof act.metadata === 'string' ? JSON.parse(act.metadata) : act.metadata;
                    } catch (e) { }

                    const previousStage = meta?.from || currentStageName;
                    const nextStage = meta?.to || 'unknown';

                    pushStage(previousStage, currentStageEntry, actDate,
                        act.action_type === 'approve' ? nextStage : (act.action_type === 'return' ? 'Returned' : 'Rejected'),
                        act.action_type === 'return' ? (meta?.reason || 'See comments') : undefined
                    );

                    currentStageName = nextStage;
                    currentStageEntry = actDate;
                }
            }

            if (currentStageEntry && loan.status !== 'rejected') {
                // Push active stage if not completely rejected or disbursed. Even disbursed could be active "disbursed" stage but let's just push it.
                pushStage(currentStageName, currentStageEntry, null, undefined, undefined);
            }

            reportData.push(...timeline);
        }

        res.json({
            data: reportData.reverse(), // most recent first
            meta: {
                total,
                page: Number(page),
                limit: Number(limit)
            }
        });

    } catch (error) {
        console.error("Timeline report error:", error);
        res.status(500).json({ message: "Error fetching timeline report" });
    }
});

/**
 * @swagger
 * /api/staff/loans/timeline-report/export-csv:
 *   get:
 *     summary: Export loan timeline report to CSV
 *     tags: [Staff]
 */
router.get('/loans/timeline-report/export-csv', async (req, res) => {
    // @ts-ignore
    const user = req.user as any;
    if (!user || (user.role !== 'customer_experience' && user.role !== 'super_admin' && user.role !== 'superadmin')) {
        return res.status(403).json({ message: "Forbidden. Only Customer Experience and Super Admins can access." });
    }

    try {
        const { search = '' } = req.query;

        let baseQuery = `
            SELECT l.id, l.applicant_full_name, l.requested_loan_amount, l.loan_type, l.product_type, l.status, l.stage, c.full_name as officer_name
            FROM loans l
            LEFT JOIN customers c ON l.sales_officer_id = c.id
        `;
        const filters: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (search) {
            filters.push(`(l.applicant_full_name ILIKE $${paramIndex} OR CAST(l.id AS TEXT) ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (filters.length > 0) {
            baseQuery += ` WHERE ` + filters.join(' AND ');
        }

        baseQuery += ` ORDER BY l.created_at DESC`;

        const loansResult = await pool.query(baseQuery, params);
        const loans = loansResult.rows;

        if (loans.length === 0) {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="loan_timeline_report.csv"');
            res.send('Reference,Loan Type,Product Type,Amount,Current Status,Sales Officer,Initiator,Stage Name,Stage Entry Timestamp,Stage Exit Timestamp,Stage TAT (Hours),Final Node,Return Reason\n');
            return;
        }

        const loanIds = loans.map((l: any) => l.id);
        const placeHolders = loanIds.map((_: any, i: number) => `$${i + 1}`).join(',');

        const activitiesResult = await pool.query(`
            SELECT loan_id, action_type, created_at, metadata, description
            FROM loan_activities
            WHERE loan_id IN (${placeHolders})
            ORDER BY created_at ASC
        `, loanIds);

        const activitiesByLoan = activitiesResult.rows.reduce((acc: any, act: any) => {
            if (!acc[act.loan_id]) acc[act.loan_id] = [];
            acc[act.loan_id].push(act);
            return acc;
        }, {});

        const reportData: any[] = [];
        const now = new Date();

        for (const loan of loans) {
            const acts = activitiesByLoan[loan.id] || [];

            let currentStageName = 'sales';
            let currentStageEntry: Date | null = null;
            let timeline: any[] = [];

            const pushStage = (stageName: string, entry: Date, exit: Date | null, finalNodeAction?: string, returnReason?: string) => {
                const endTime = exit || now;
                const tatHours = (endTime.getTime() - entry.getTime()) / (1000 * 60 * 60);

                let formattedStageName = stageName.replace(/_/g, ' ');
                formattedStageName = formattedStageName.charAt(0).toUpperCase() + formattedStageName.slice(1);

                timeline.push({
                    reference: `LOAN-${loan.id}`,
                    loanType: loan.loan_type === 'new' ? 'New Loan' : loan.loan_type === 'topup' ? 'Top-Up' : loan.loan_type === 'buy_over' ? 'Buy Over' : loan.loan_type,
                    productType: loan.product_type || 'Public Sector Loan',
                    amount: loan.requested_loan_amount,
                    currentStatus: loan.status,
                    salesOfficer: loan.officer_name || '-',
                    initiator: loan.applicant_full_name,
                    stageName: formattedStageName,
                    entryTimestamp: entry.toISOString(),
                    exitTimestamp: exit ? exit.toISOString() : '',
                    tatHours: tatHours.toFixed(2),
                    finalNode: finalNodeAction || '',
                    returnReason: returnReason || ''
                });
            };

            for (const act of acts) {
                const actDate = new Date(act.created_at);

                if (act.action_type === 'create_application') {
                    currentStageEntry = actDate;
                    currentStageName = 'sales';
                } else if (['approve', 'return', 'reject'].includes(act.action_type)) {
                    if (!currentStageEntry) currentStageEntry = actDate;

                    let meta = null;
                    try {
                        meta = typeof act.metadata === 'string' ? JSON.parse(act.metadata) : act.metadata;
                    } catch (e) { }

                    const previousStage = meta?.from || currentStageName;
                    const nextStage = meta?.to || 'unknown';

                    pushStage(previousStage, currentStageEntry, actDate,
                        act.action_type === 'approve' ? nextStage : (act.action_type === 'return' ? 'Returned' : 'Rejected'),
                        act.action_type === 'return' ? (meta?.reason || 'See comments') : undefined
                    );

                    currentStageName = nextStage;
                    currentStageEntry = actDate;
                }
            }

            if (currentStageEntry && loan.status !== 'rejected') {
                pushStage(currentStageName, currentStageEntry, null);
            }

            reportData.push(...timeline);
        }

        const headers = ["Reference", "Loan Type", "Product Type", "Amount", "Current Status", "Sales Officer", "Initiator", "Stage Name", "Stage Entry Timestamp", "Stage Exit Timestamp", "Stage TAT (Hours)", "Final Node", "Return Reason"];
        const csvRows = reportData.map(row => [
            row.reference,
            row.loanType,
            row.productType,
            row.amount,
            row.currentStatus,
            row.salesOfficer,
            row.initiator,
            row.stageName,
            row.entryTimestamp,
            row.exitTimestamp,
            row.tatHours,
            row.finalNode,
            row.returnReason
        ].map(val => `"${val}"`).join(','));

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="loan_timeline_report.csv"');
        res.send([headers.join(','), ...csvRows].join('\n'));

    } catch (error) {
        console.error("Timeline export error:", error);
        res.status(500).json({ message: "Error exporting timeline report" });
    }
});

/**
 * @swagger
 * /api/staff/investments/timeline-report:
 *   get:
 *     summary: Get timeline report of investment stages
 *     tags: [Staff]
 */
router.get('/investments/timeline-report', async (req, res) => {
    // @ts-ignore
    const user = req.user as any;
    if (!user || (user.role !== 'customer_experience' && user.role !== 'super_admin' && user.role !== 'superadmin')) {
        return res.status(403).json({ message: "Forbidden. Only Customer Experience and Super Admins can access." });
    }

    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        let baseQuery = `
            SELECT i.id, COALESCE(i.company_name, i.rep_full_name, c.full_name) as initiator, 
                   i.investment_amount, i.investment_type, i.status, i.stage, staff.full_name as officer_name
            FROM investments i
            LEFT JOIN customers c ON i.customer_id = c.id
            LEFT JOIN customers staff ON i.sales_officer_id = staff.id
        `;
        const filters: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (search) {
            filters.push(`(COALESCE(i.company_name, i.rep_full_name, c.full_name) ILIKE $${paramIndex} OR CAST(i.id AS TEXT) ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (filters.length > 0) {
            baseQuery += ` WHERE ` + filters.join(' AND ');
        }

        baseQuery += ` ORDER BY i.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(limit, offset);

        const invResult = await pool.query(baseQuery, params);
        const investments = invResult.rows;

        if (investments.length === 0) {
            return res.json({
                data: [],
                meta: { total: 0, page: Number(page), limit: Number(limit) }
            });
        }

        let countQuery = `SELECT COUNT(*) FROM investments`;
        const countParams: any[] = [];
        if (filters.length > 0) {
            countQuery += ` WHERE ` + filters.join(' AND ');
            countParams.push(`%${search}%`);
        }
        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count, 10);

        const ids = investments.map(i => i.id);
        const activitiesResult = await pool.query(`
            SELECT investment_id, action_type, created_at, metadata, description
            FROM investment_activities
            WHERE investment_id = ANY($1)
            ORDER BY created_at ASC
        `, [ids]);

        const actsByInv = activitiesResult.rows.reduce((acc: any, act: any) => {
            if (!acc[act.investment_id]) acc[act.investment_id] = [];
            acc[act.investment_id].push(act);
            return acc;
        }, {});

        const reportData: any[] = [];
        const now = new Date();

        for (const inv of investments) {
            const acts = actsByInv[inv.id] || [];
            let currentStageName = 'submitted';
            let currentStageEntry: Date | null = null;
            let timeline: any[] = [];

            const pushStage = (stageName: string, entry: Date, exit: Date | null, finalNodeAction?: string) => {
                const endTime = exit || now;
                const tatHours = (endTime.getTime() - entry.getTime()) / (1000 * 60 * 60);

                timeline.push({
                    loanId: inv.id,
                    loanType: inv.investment_type,
                    productType: 'Investment',
                    amount: inv.investment_amount,
                    currentStatus: inv.status,
                    initiator: inv.initiator,
                    officerName: inv.officer_name || '-',
                    stageName: stageName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    entryTimestamp: entry.toISOString(),
                    exitTimestamp: exit ? exit.toISOString() : null,
                    tatHours: tatHours.toFixed(2),
                    finalNode: finalNodeAction || ''
                });
            };

            for (const act of acts) {
                const actDate = new Date(act.created_at);
                if (act.action_type === 'create' || act.action_type === 'create_application') {
                    currentStageEntry = actDate;
                    currentStageName = 'submitted';
                } else if (['approve', 'reject'].includes(act.action_type)) {
                    if (!currentStageEntry) currentStageEntry = actDate;
                    let meta = null;
                    try {
                        meta = typeof act.metadata === 'string' ? JSON.parse(act.metadata) : act.metadata;
                    } catch (e) { }
                    const prev = meta?.old_stage || currentStageName;
                    const next = meta?.new_stage || 'unknown';
                    pushStage(prev, currentStageEntry, actDate, act.action_type === 'approve' ? next : 'Rejected');
                    currentStageName = next;
                    currentStageEntry = actDate;
                }
            }

            if (currentStageEntry && inv.status !== 'rejected' && inv.status !== 'active') {
                pushStage(currentStageName, currentStageEntry, null);
            }

            reportData.push(...timeline);
        }

        res.json({
            data: reportData.reverse(),
            meta: { total, page: Number(page), limit: Number(limit) }
        });

    } catch (error) {
        console.error("Investment timeline error:", error);
        res.status(500).json({ message: "Error fetching investment timeline" });
    }
});

/**
 * @swagger
 * /api/staff/investments/timeline-report/export-csv:
 *   get:
 *     summary: Export investment timeline report to CSV
 *     tags: [Staff]
 */
router.get('/investments/timeline-report/export-csv', async (req, res) => {
    // @ts-ignore
    const user = req.user as any;
    if (!user || (user.role !== 'customer_experience' && user.role !== 'super_admin' && user.role !== 'superadmin')) {
        return res.status(403).json({ message: "Forbidden" });
    }

    try {
        const { search = '' } = req.query;

        let baseQuery = `
            SELECT i.id, COALESCE(i.company_name, i.rep_full_name, c.full_name) as initiator, 
                   i.investment_amount, i.investment_type, i.status, i.stage, staff.full_name as officer_name
            FROM investments i
            LEFT JOIN customers c ON i.customer_id = c.id
            LEFT JOIN customers staff ON i.sales_officer_id = staff.id
        `;
        const filters: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (search) {
            filters.push(`(COALESCE(i.company_name, i.rep_full_name, c.full_name) ILIKE $${paramIndex} OR CAST(i.id AS TEXT) ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (filters.length > 0) baseQuery += ` WHERE ` + filters.join(' AND ');
        baseQuery += ` ORDER BY i.created_at DESC`;

        const invResult = await pool.query(baseQuery, params);
        const investments = invResult.rows;

        if (investments.length === 0) {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="investment_timeline_report.csv"');
            res.send('Reference,Investment Type,Amount,Current Status,Sales Officer,Initiator,Stage Name,Stage Entry Timestamp,Stage Exit Timestamp,Stage TAT (Hours),Final Node\n');
            return;
        }

        const ids = investments.map(i => i.id);
        const actsRes = await pool.query(`
            SELECT investment_id, action_type, created_at, metadata, description
            FROM investment_activities
            WHERE investment_id = ANY($1)
            ORDER BY created_at ASC
        `, [ids]);

        const actsByInv = actsRes.rows.reduce((acc: any, act: any) => {
            if (!acc[act.investment_id]) acc[act.investment_id] = [];
            acc[act.investment_id].push(act);
            return acc;
        }, {});

        const reportData: any[] = [];
        const now = new Date();

        for (const inv of investments) {
            const acts = actsByInv[inv.id] || [];
            let currentStageName = 'submitted';
            let currentStageEntry: Date | null = null;
            let timeline: any[] = [];

            const pushStage = (stageName: string, entry: Date, exit: Date | null, finalNodeAction?: string) => {
                const endTime = exit || now;
                const tatHours = (endTime.getTime() - entry.getTime()) / (1000 * 60 * 60);

                timeline.push({
                    reference: `INV-${inv.id}`,
                    investmentType: inv.investment_type,
                    amount: inv.investment_amount,
                    currentStatus: inv.status,
                    salesOfficer: inv.officer_name || '-',
                    initiator: inv.initiator,
                    stageName: stageName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    entryTimestamp: entry.toISOString(),
                    exitTimestamp: exit ? exit.toISOString() : '',
                    tatHours: tatHours.toFixed(2),
                    finalNode: finalNodeAction || ''
                });
            };

            for (const act of acts) {
                const actDate = new Date(act.created_at);
                if (act.action_type === 'create' || act.action_type === 'create_application') {
                    currentStageEntry = actDate;
                    currentStageName = 'submitted';
                } else if (['approve', 'reject'].includes(act.action_type)) {
                    if (!currentStageEntry) currentStageEntry = actDate;
                    let meta = null;
                    try {
                        meta = typeof act.metadata === 'string' ? JSON.parse(act.metadata) : act.metadata;
                    } catch (e) { }
                    const prev = meta?.old_stage || currentStageName;
                    const next = meta?.new_stage || 'unknown';
                    pushStage(prev, currentStageEntry, actDate, act.action_type === 'approve' ? next : 'Rejected');
                    currentStageName = next;
                    currentStageEntry = actDate;
                }
            }

            if (currentStageEntry && inv.status !== 'rejected' && inv.status !== 'active') {
                pushStage(currentStageName, currentStageEntry, null);
            }
            reportData.push(...timeline);
        }

        const headers = ["Reference", "Investment Type", "Amount", "Current Status", "Sales Officer", "Initiator", "Stage Name", "Stage Entry Timestamp", "Stage Exit Timestamp", "Stage TAT (Hours)", "Final Node"];
        const csvRows = reportData.map(row => [
            row.reference,
            row.investmentType,
            row.amount,
            row.currentStatus,
            row.salesOfficer,
            row.initiator,
            row.stageName,
            row.entryTimestamp,
            row.exitTimestamp,
            row.tatHours,
            row.finalNode
        ].map(val => `"${val}"`).join(','));

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="investment_timeline_report.csv"');
        res.send([headers.join(','), ...csvRows].join('\n'));

    } catch (error) {
        console.error("Investment export error:", error);
        res.status(500).json({ message: "Error exporting investment timeline" });
    }
});

/**
 * @swagger
 * /api/staff/reports/tat-summary:
 *   get:
 *     summary: Get overview statistics and TAT aggregates for reporting
 *     tags: [Staff]
 */
router.get('/reports/tat-summary', async (req, res) => {
    // @ts-ignore
    const user = req.user as any;
    if (!user || (user.role !== 'customer_experience' && user.role !== 'super_admin' && user.role !== 'superadmin')) {
        return res.status(403).json({ message: "Forbidden" });
    }

    try {
        const { type = 'LOAN', period = 'this_month' } = req.query; // 'LOAN' or 'INVESTMENT'
        const isLoan = type === 'LOAN';

        let dateFilter = '';
        if (period === 'this_week') {
            dateFilter = "created_at >= date_trunc('week', now())";
        } else if (period === 'last_week') {
            dateFilter = "created_at >= date_trunc('week', now()) - interval '1 week' AND created_at < date_trunc('week', now())";
        } else if (period === 'this_month') {
            dateFilter = "created_at >= date_trunc('month', now())";
        } else if (period === 'last_month') {
            dateFilter = "created_at >= date_trunc('month', now()) - interval '1 month' AND created_at < date_trunc('month', now())";
        } else if (period === 'this_year') {
            dateFilter = "created_at >= date_trunc('year', now())";
        }

        // 1. Fetch Basic Metrics
        const table = isLoan ? 'loans' : 'investments';
        const amountField = isLoan ? 'requested_loan_amount' : 'investment_amount';
        const approvedStatuses = isLoan ? "('approved', 'disbursed')" : "('approved', 'active')";

        const metricsRes = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE status IN ${approvedStatuses}) as approved_count,
                COUNT(*) FILTER (WHERE status NOT IN ${approvedStatuses} AND status != 'rejected') as pending_count,
                COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
                SUM(${amountField}) as total_volume
            FROM ${table}
            ${dateFilter ? `WHERE ${dateFilter}` : ''}
        `);

        const metrics = metricsRes.rows[0];

        // 2. Aggregate Product Mix
        const mixField = isLoan ? 'loan_type' : 'investment_type';
        const mixRes = await pool.query(`
            SELECT ${mixField} as type, COUNT(*) as count 
            FROM ${table} 
            GROUP BY ${mixField}
        `);
        const productMix = mixRes.rows.map(r => ({
            name: r.type || 'Unknown',
            value: parseInt(r.count)
        }));

        // 3. Fetch Average TAT and Performance (Last 200 applications)
        const activityTable = isLoan ? 'loan_activities' : 'investment_activities';
        const idField = isLoan ? 'loan_id' : 'investment_id';

        let recentAppsRes;
        if (isLoan) {
            recentAppsRes = await pool.query(`
                SELECT id, ${amountField} as amount, applicant_full_name as full_name, created_at, loan_type as sub_type
                FROM loans 
                ${dateFilter ? `WHERE ${dateFilter}` : ''}
                ORDER BY created_at DESC 
                LIMIT 500
            `);
        } else {
            recentAppsRes = await pool.query(`
                SELECT i.id, i.${amountField} as amount, c.full_name, i.created_at, i.investment_type as sub_type
                FROM investments i
                LEFT JOIN customers c ON i.customer_id = c.id
                ${dateFilter ? `WHERE ${dateFilter.replace(/created_at/g, 'i.created_at')}` : ''}
                ORDER BY i.created_at DESC 
                LIMIT 500
            `);
        }
        const recentApps = recentAppsRes.rows;
        const recentIds = recentApps.map(r => r.id);

        if (recentIds.length === 0) {
            return res.json({
                summary: {
                    approved: parseInt(metrics.approved_count || '0'),
                    pending: parseInt(metrics.pending_count || '0'),
                    rejected: parseInt(metrics.rejected_count || '0'),
                    totalVolume: parseFloat(metrics.total_volume || '0')
                },
                chartData: [],
                productMix: [],
                dailyApprovals: [],
                performance: { fastest: [], slowest: [] },
                stageVolume: []
            });
        }

        const actsRes = await pool.query(`
            SELECT ${idField} as app_id, action_type, created_at, metadata
            FROM ${activityTable}
            WHERE ${idField} = ANY($1)
            ORDER BY created_at ASC
        `, [recentIds]);

        const stagesTAT: Record<string, number[]> = {};
        const stageVolume: Record<string, number> = {};
        const appPerformance: any[] = [];
        const dailyApprovals: Record<string, { new: number, spillover: number }> = {};

        const actsByApp = actsRes.rows.reduce((acc: any, act: any) => {
            if (!acc[act.app_id]) acc[act.app_id] = [];
            acc[act.app_id].push(act);
            return acc;
        }, {});

        // Helper to get day string
        const getDay = (date: Date) => date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

        for (const appId in actsByApp) {
            const acts = actsByApp[appId];
            const app = recentApps.find(a => a.id == appId);
            let currentEntry: Date | null = null;
            let currentStage: string | null = null;
            let totalTatHours = 0;
            let isFinalized = false;

            for (const act of acts) {
                const actDate = new Date(act.created_at);
                
                if (act.action_type === 'create_application' || act.action_type === 'create' || act.action_type === 'staff_application') {
                    currentEntry = actDate;
                    currentStage = isLoan ? 'sales' : 'submitted';
                    if (!stageVolume[currentStage]) stageVolume[currentStage] = 0;
                    stageVolume[currentStage]++;
                } else if (['approve', 'return', 'reject', 'action'].includes(act.action_type)) {
                    if (currentEntry && currentStage) {
                        const tatHours = (actDate.getTime() - currentEntry.getTime()) / (1000 * 60 * 60);
                        if (!stagesTAT[currentStage]) stagesTAT[currentStage] = [];
                        stagesTAT[currentStage].push(tatHours);
                        totalTatHours += tatHours;
                    }
                    
                    let meta = null;
                    try { meta = typeof act.metadata === 'string' ? JSON.parse(act.metadata) : act.metadata; } catch (e) {}
                    const nextStage = isLoan ? (meta?.to || 'unknown') : (meta?.new_stage || 'unknown');
                    
                    if (nextStage !== 'unknown') {
                        if (!stageVolume[nextStage]) stageVolume[nextStage] = 0;
                        stageVolume[nextStage]++;
                    }

                    // Track daily volume across all stages (formerly just final approvals)
                    if (nextStage !== 'unknown' && nextStage !== currentStage) {
                        const day = getDay(actDate);
                        if (!dailyApprovals[day]) dailyApprovals[day] = { new: 0, spillover: 0 };
                        
                        // Spillover logic: if created more than 48h prior to this action
                        const appCreated = new Date(app.created_at);
                        const isSpillover = (actDate.getTime() - appCreated.getTime()) / (1000 * 60 * 60) > 48;
                        if (isSpillover) dailyApprovals[day].spillover++;
                        else dailyApprovals[day].new++;
                        
                        isFinalized = true;
                    }

                    currentStage = nextStage;
                    currentEntry = actDate;
                }
            }

            if (isFinalized && totalTatHours > 0) {
                appPerformance.push({
                    id: appId,
                    ref: `${isLoan ? 'L' : 'I'}-${appId}`,
                    name: app.full_name || 'Legacy Customer',
                    amount: app.amount,
                    tatHours: parseFloat(totalTatHours.toFixed(2)),
                    type: app.sub_type || 'Standard',
                    createdAt: app.created_at
                });
            }
        }

        const chartData = Object.entries(stagesTAT).map(([stage, hrs]) => ({
            stage: stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            avgHours: parseFloat((hrs.reduce((a, b) => a + b, 0) / hrs.length).toFixed(1))
        }));

        const stageVolumeData = Object.entries(stageVolume).map(([stage, count]) => ({
            stage: stage.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            passes: count
        })).sort((a, b) => b.passes - a.passes);

        const sortedPerformanceByTAT = [...appPerformance].sort((a, b) => a.tatHours - b.tatHours);
        const fastest = sortedPerformanceByTAT.slice(0, 3);
        const slowest = sortedPerformanceByTAT.slice(-3).reverse();

        res.json({
            summary: {
                approved: parseInt(metrics.approved_count || '0'),
                pending: parseInt(metrics.pending_count || '0'),
                rejected: parseInt(metrics.rejected_count || '0'),
                totalVolume: parseFloat(metrics.total_volume || '0')
            },
            chartData,
            productMix,
            dailyApprovals: Object.entries(dailyApprovals).map(([day, counts]) => ({ day, ...counts })),
            performance: { fastest, slowest },
            stageVolume: stageVolumeData
        });

    } catch (error) {
        console.error("TAT summary error:", error);
        res.status(500).json({ message: "Error calculating TAT summary" });
    }
});
/**
 * @swagger
 * /api/staff/loans/timeline-report/export-csv:
 *   get:
 *     summary: Export full timeline report as CSV
 *     tags: [Staff]
 *     responses:
 *       200:
 *         description: CSV file download of the complete timeline report
 */
router.get('/loans/timeline-report/export-csv', async (req, res) => {
    // @ts-ignore
    const user = req.user as any;
    if (!user || (user.role !== 'customer_experience' && user.role !== 'super_admin' && user.role !== 'superadmin')) {
        return res.status(403).json({ message: "Forbidden. Only Customer Experience and Super Admins can access." });
    }

    try {
        const { search = '' } = req.query;

        let baseQuery = `
            SELECT l.id, l.applicant_full_name, l.requested_loan_amount, l.loan_type, l.product_type, l.status, l.stage, c.full_name as officer_name
            FROM loans l
            LEFT JOIN customers c ON l.sales_officer_id = c.id
        `;
        const filters: string[] = [];
        const params: any[] = [];
        let paramIndex = 1;

        if (search) {
            filters.push(`(l.applicant_full_name ILIKE $${paramIndex} OR CAST(l.id AS TEXT) ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (filters.length > 0) {
            baseQuery += ` WHERE ` + filters.join(' AND ');
        }

        baseQuery += ` ORDER BY l.created_at DESC`;

        const loansResult = await pool.query(baseQuery, params);
        const loans = loansResult.rows;

        if (loans.length === 0) {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="timeline_report.csv"');
            res.send('Reference,Loan Type,Product Type,Amount,Current Status,Sales Officer,Initiator,Stage Name,Stage Entry Timestamp,Stage Exit Timestamp,Stage TAT (Hours),Final Node,Return Reason\n');
            return;
        }

        const loanIds = loans.map((l: any) => l.id);
        const placeHolders = loanIds.map((_: any, i: number) => `$${i + 1}`).join(',');

        const activitiesResult = await pool.query(`
            SELECT loan_id, action_type, created_at, metadata, description
            FROM loan_activities
            WHERE loan_id IN (${placeHolders})
            ORDER BY created_at ASC
        `, loanIds);

        const activitiesByLoan = activitiesResult.rows.reduce((acc: any, act: any) => {
            if (!acc[act.loan_id]) acc[act.loan_id] = [];
            acc[act.loan_id].push(act);
            return acc;
        }, {});

        const reportData: any[] = [];
        const now = new Date();

        for (const loan of loans) {
            const acts = activitiesByLoan[loan.id] || [];

            let currentStageName = 'sales';
            let currentStageEntry: Date | null = null;
            let timeline: any[] = [];

            const pushStage = (stageName: string, entry: Date, exit: Date | null, finalNodeAction?: string, returnReason?: string) => {
                const endTime = exit || now;
                const tatHours = (endTime.getTime() - entry.getTime()) / (1000 * 60 * 60);

                let formattedStageName = stageName.replace(/_/g, ' ');
                formattedStageName = formattedStageName.charAt(0).toUpperCase() + formattedStageName.slice(1);

                timeline.push({
                    loanId: loan.id,
                    loanType: loan.loan_type === 'new' ? 'New Loan' : loan.loan_type === 'topup' ? 'Top-Up' : loan.loan_type === 'buy_over' ? 'Buy Over' : loan.loan_type,
                    productType: loan.product_type || 'Public Sector Loan',
                    amount: loan.requested_loan_amount,
                    currentStatus: loan.status,
                    initiator: loan.applicant_full_name,
                    officerName: loan.officer_name || '-',
                    stageName: formattedStageName,
                    entryTimestamp: entry.toISOString(),
                    exitTimestamp: exit ? exit.toISOString() : null,
                    tatHours: tatHours.toFixed(2),
                    finalNode: finalNodeAction,
                    returnReason: returnReason
                });
            };

            for (const act of acts) {
                const actDate = new Date(act.created_at);

                if (act.action_type === 'create_application') {
                    currentStageEntry = actDate;
                    currentStageName = 'sales';
                } else if (['approve', 'return', 'reject'].includes(act.action_type)) {
                    if (!currentStageEntry) currentStageEntry = actDate;

                    let meta = null;
                    try {
                        meta = typeof act.metadata === 'string' ? JSON.parse(act.metadata) : act.metadata;
                    } catch (e) { }

                    const previousStage = meta?.from || currentStageName;
                    const nextStage = meta?.to || 'unknown';

                    pushStage(previousStage, currentStageEntry, actDate,
                        act.action_type === 'approve' ? nextStage : (act.action_type === 'return' ? 'Returned' : 'Rejected'),
                        act.action_type === 'return' ? (meta?.reason || 'See comments') : undefined
                    );

                    currentStageName = nextStage;
                    currentStageEntry = actDate;
                }
            }

            if (currentStageEntry && loan.status !== 'rejected') {
                pushStage(currentStageName, currentStageEntry, null, undefined, undefined);
            }

            reportData.push(...timeline);
        }

        reportData.reverse();

        // Build CSV
        const csvHeaders = ['Reference', 'Loan Type', 'Product Type', 'Amount', 'Current Status', 'Sales Officer', 'Initiator', 'Stage Name', 'Stage Entry Timestamp', 'Stage Exit Timestamp', 'Stage TAT (Hours)', 'Final Node', 'Return Reason'];

        const escapeCsvField = (field: any): string => {
            if (field === null || field === undefined) return '';
            const str = String(field);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const csvRows = reportData.map(row => [
            `APP-${row.loanId.toString().padStart(3, '0')}`,
            row.loanType,
            row.productType,
            Number(row.amount).toFixed(2),
            row.currentStatus,
            row.officerName,
            row.initiator,
            row.stageName,
            row.entryTimestamp ? new Date(row.entryTimestamp).toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '',
            row.exitTimestamp ? new Date(row.exitTimestamp).toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '',
            row.tatHours,
            row.finalNode || '',
            row.returnReason || ''
        ].map(escapeCsvField).join(','));

        const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="timeline_report_${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csvContent);

    } catch (error) {
        console.error("Timeline report CSV export error:", error);
        res.status(500).json({ message: "Error exporting timeline report" });
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
        const { page = 1, limit = 10, search = '', status = '', stage = '', officer = '' } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        const role = (req.user as any)?.role?.toLowerCase?.() || '';

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
        if (typeof officer === 'string' && officer) {
            if (officer === 'unassigned') {
                filters.push(`(l.sales_officer_id IS NULL OR c.full_name = 'Marketing Promotion')`);
            } else {
                filters.push(`l.sales_officer_id = $${paramIndex++}`);
                values.push(officer);
            }
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

        if (role === 'marketing') {
            // Marketing is restricted to promo-attributed applications only.
            filters.push(`p.utm_campaign IS NOT NULL`);
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
                l.loan_type, l.topup_amount, l.buy_over_amount, l.disbursement_amount, l.disb_date,
                c.full_name as officer_name, c.email as officer_email, l.sales_officer_id, l.indemnity_document_url,
                p.utm_source as promotion_source
            FROM loans l
            LEFT JOIN customers c ON l.sales_officer_id = c.id
            LEFT JOIN promotions p ON l.referral_code = p.utm_campaign
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
            LEFT JOIN promotions p ON l.referral_code = p.utm_campaign
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
 * /api/staff/investments:
 *   get:
 *     summary: Get all investments for staff
 *     tags: [Staff]
 *     responses:
 *       200:
 *         description: List of all investments
 *       500:
 *         description: Internal server error
 */
router.get('/investments', async (req: any, res) => {
    try {
        const { investmentService } = await import('../services/investmentService.js');
        const role = req.user?.role?.toLowerCase();
        
        const options = {
            officerId: role === 'sales_officer' ? req.user.id : undefined,
            promoOnly: role === 'marketing'
        };
        
        const investments = await investmentService.getAllInvestments(options);
        res.json(investments);
    } catch (error) {
        console.error("Error fetching investments:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/staff/investments/{id}:
 *   get:
 *     summary: Get a specific investment by ID
 *     tags: [Staff]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Investment details
 *       404:
 *         description: Investment not found
 */
router.get('/investments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const role = (req.user as any)?.role?.toLowerCase?.() || '';
        if (!id || id === 'null' || isNaN(Number(id))) {
            return res.status(400).json({ message: "Invalid investment ID format" });
        }
        const query = `
            SELECT i.*, 
                   c.full_name as customer_name, c.email as customer_email, c.avatar_url, c.is_active as customer_active,
                   c.has_failed_selfie,
                   staff.full_name as officer_name, staff.email as officer_email, staff.avatar_url as officer_avatar,
                   up.bank_name, up.account_number, up.account_name, up.is_identity_verified,
                   p.utm_source as promotion_source, p.utm_medium as promotion_medium, p.utm_campaign as promotion_campaign,
                   m.hear_about_us, m.referral_code as marketing_referral, m.officer_name as marketing_officer
            FROM investments i
            LEFT JOIN customers c ON i.customer_id = c.id
            LEFT JOIN user_profiles up ON c.id = up.user_id
            LEFT JOIN customers staff ON i.sales_officer_id = staff.id
            LEFT JOIN promotions p ON i.promotion_id = p.id OR i.referral_code = p.utm_campaign
            LEFT JOIN marketing m ON i.customer_id = m.customer_id
            WHERE i.id = $1
        `;
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Investment not found" });
        }

        const investment = result.rows[0];
        if (role === 'marketing' && !investment.promotion_source) {
            return res.status(404).json({ message: "Investment not found" });
        }

        if (!investment.casa_account_number && investment.customer_id) {
            const casaRes = await pool.query(`
                SELECT casa_account_number 
                FROM investments 
                WHERE customer_id = $1 
                  AND casa_account_number IS NOT NULL 
                  AND casa_account_number != ''
                ORDER BY created_at DESC 
                LIMIT 1
            `, [investment.customer_id]);

            if (casaRes.rows.length > 0) {
                investment.suggested_casa_number = casaRes.rows[0].casa_account_number;
            }
        }

        res.json(investment);
    } catch (error) {
        console.error("Error fetching investment details:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/staff/investments/{id}/activities:
 *   get:
 *     summary: Get activity timeline for an investment
 *     tags: [Staff]
 */
router.get('/investments/:id/activities', async (req, res) => {
    const { id } = req.params;
    try {
        const activities = await pool.query(`
            SELECT ia.*, c.full_name as user_name, c.email as user_email, c.role as user_role, c.avatar_url
            FROM investment_activities ia
            LEFT JOIN customers c ON ia.user_id = c.id
            WHERE ia.investment_id = $1
            ORDER BY ia.created_at DESC
        `, [id]);
        res.json(activities.rows);
    } catch (error) {
        console.error("Error fetching activities:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/staff/investments/{id}/assign:
 *   patch:
 *     summary: Reassign an investment to a different Sales Officer
 *     tags: [Staff]
 */
router.patch('/investments/:id/assign', async (req, res) => {
    const { id } = req.params;
    const { sales_officer_id } = req.body;
    // @ts-ignore
    const user = req.user as any;

    if (!user) return res.status(401).json({ message: "Unauthorized" });

    // Permission Check: Sales Manager, Admin, Super Admin, Customer Experience, Marketing
    const allowedRoles = ['sales_manager', 'admin', 'super_admin', 'superadmin', 'customer_experience'];
    if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ message: "Only Managers, Admins and CX can reassign investments." });
    }

    const isUnassign = !sales_officer_id || sales_officer_id === 'unassign';

    try {
        const investmentResult = await pool.query('SELECT sales_officer_id, customer_id FROM investments WHERE id = $1', [id]);
        const investment = investmentResult.rows[0];
        if (!investment) return res.status(404).json({ message: "Investment not found" });

        if (isUnassign) {
            if (!investment.sales_officer_id) {
                return res.json({ message: "Investment is already unassigned." });
            }

            // Perform Unassignment
            await pool.query(
                'UPDATE investments SET sales_officer_id = NULL, updated_at = NOW() WHERE id = $1',
                [id]
            );

            // Log Activity
            await pool.query(
                `INSERT INTO investment_activities (investment_id, user_id, action_type, description, metadata)
                 VALUES ($1, $2, 'unassign_officer', $3, $4)`,
                [
                    id, user.id,
                    `Unassigned from previous officer`,
                    JSON.stringify({ from: investment.sales_officer_id, to: null, updatedBy: user.email })
                ]
            );

            return res.json({ message: "Investment unassigned successfully" });
        }

        const officerResult = await pool.query('SELECT id, email, full_name FROM customers WHERE id = $1', [sales_officer_id]);
        const newOfficer = officerResult.rows[0];
        if (!newOfficer) return res.status(404).json({ message: "Target officer not found." });

        if (investment.sales_officer_id === sales_officer_id) {
            return res.json({ message: "Investment is already assigned to this officer." });
        }

        // Update Assignment
        await pool.query(
            'UPDATE investments SET sales_officer_id = $1, updated_at = NOW() WHERE id = $2',
            [sales_officer_id, id]
        );

        // Log Activity
        await pool.query(
            `INSERT INTO investment_activities (investment_id, user_id, action_type, description, metadata)
             VALUES ($1, $2, 'reassign_officer', $3, $4)`,
            [
                id, user.id,
                `Reassigned to ${newOfficer.full_name}`,
                JSON.stringify({ from: investment.sales_officer_id, to: sales_officer_id, updatedBy: user.email })
            ]
        );

        // Notify New Officer
        try {
            const custResult = await pool.query('SELECT full_name FROM customers WHERE id = $1', [investment.customer_id]);
            const customerName = custResult.rows[0]?.full_name || 'Nolt Customer';
            await zeptoService.sendInvestmentNotification([newOfficer.email], id, customerName, 'Assigned to you');
        } catch (emailError) {
            console.warn("Failed to send assignment notification:", emailError);
        }

        res.json({ message: `Investment reassigned to ${newOfficer.full_name}` });

    } catch (error) {
        console.error("Error reassigning investment:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/staff/investments/{id}/indemnity:
 *   post:
 *     summary: Upload or generate an indemnity document for an investment
 *     tags: [Staff]
 */
router.post('/investments/:id/indemnity', isStaff, async (req, res) => {
    const { id } = req.params;
    const { signature_base64, indemnity_document_url } = req.body;
    // @ts-ignore
    const user = req.user as any;

    try {
        let finalUrl = indemnity_document_url;

        // If a signature is provided, generate the PDF
        if (signature_base64 && !finalUrl) {
            const invResult = await pool.query(`
                SELECT i.*, c.full_name as customer_name, c.email as customer_email 
                FROM investments i
                JOIN customers c ON i.customer_id = c.id
                WHERE i.id = $1
            `, [id]);
            const inv = invResult.rows[0];

            if (!inv) return res.status(404).json({ message: "Investment not found" });

            finalUrl = await pdfService.generateAndUploadIndemnityPdf(
                inv.company_name || inv.rep_full_name || inv.customer_name,
                inv.customer_email,
                '', // alternate email
                new Date().toLocaleDateString(),
                inv.investment_type,
                signature_base64,
                id
            );
        }

        if (!finalUrl) {
            return res.status(400).json({ message: "No document or signature provided for indemnity." });
        }

        // Update Investment
        await pool.query(
            'UPDATE investments SET indemnity_document_url = $1, updated_at = NOW() WHERE id = $2',
            [finalUrl, id]
        );

        // Log Activity
        await pool.query(
            `INSERT INTO investment_activities (investment_id, user_id, action_type, description, metadata)
             VALUES ($1, $2, 'indemnity_signed', $3, $4)`,
            [
                id, user.id,
                'Indemnity agreement signed and uploaded',
                JSON.stringify({ updatedBy: user.email, documentUrl: finalUrl })
            ]
        );

        res.json({ message: "Indemnity document updated successfully", url: finalUrl });

    } catch (error) {
        console.error("Error processing indemnity:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/staff/loans/{id}/indemnity:
 *   post:
 *     summary: Upload or generate an indemnity document for a loan
 *     tags: [Staff]
 */
router.post('/loans/:id/indemnity', isStaff, async (req, res) => {
    const { id } = req.params;
    const { signature_base64, indemnity_document_url } = req.body;
    // @ts-ignore
    const user = req.user as any;

    try {
        let finalUrl = indemnity_document_url;

        // If a signature BASE64 is provided, generate a PDF
        if (signature_base64) {
            const loanRes = await pool.query('SELECT * FROM loans WHERE id = $1', [id]);
            if (loanRes.rows.length === 0) return res.status(404).json({ message: "Loan not found" });

            const loan = loanRes.rows[0];
            const fullName = loan.applicant_full_name || `${loan.surname} ${loan.first_name}`;
            
            finalUrl = await pdfService.generateAndUploadIndemnityPdf(
                fullName,
                loan.personal_email || '',
                '', // alternate email
                new Date().toLocaleDateString('en-GB'),
                loan.loan_type || 'Loan Application',
                signature_base64,
                id,
                'loan'
            );
        }

        if (!finalUrl) {
            return res.status(400).json({ message: "No document or signature provided for indemnity." });
        }

        // Update loan record
        await pool.query(
            'UPDATE loans SET indemnity_document_url = $1, updated_at = NOW() WHERE id = $2',
            [finalUrl, id]
        );

        // Activity Log
        await pool.query(
            `INSERT INTO loan_activities (loan_id, user_id, action_type, description, metadata) 
             VALUES ($1, $2, 'indemnity_signed', $3, $4)`,
            [id, user.id, `Indemnity agreement signed/uploaded via representative.`, JSON.stringify({ signedBy: user.email })]
        );

        res.json({
            message: "Indemnity Agreement finalized.",
            document_url: finalUrl
        });

    } catch (error: any) {
        console.error("Error processing loan indemnity:", error);
        res.status(500).json({ message: "Error processing indemnity", error: error.message });
    }
});

/**
 * @swagger
 * /api/staff/investments/{id}/action:
 *   put:
 *     summary: Approve or reject an investment to move it through the pipeline
 *     tags: [Staff]
 */
router.put('/investments/:id/action', isAuthenticated, isStaff, async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { action } = req.body; // 'approve' or 'reject'
        const user = req.user as any;
        const role = user.role;

        const investmentRes = await pool.query(`
            SELECT i.status, i.stage, i.customer_id, i.rep_full_name, i.company_name, 
                   c.email as cust_email, c.full_name as cust_full_name 
            FROM investments i
            LEFT JOIN customers c ON i.customer_id = c.id
            WHERE i.id = $1
        `, [id]);
        if (investmentRes.rows.length === 0) return res.status(404).json({ message: "Investment not found" });

        const investment = investmentRes.rows[0];

        if (investment.status !== 'pending') {
            return res.status(400).json({ message: "Investment is no longer pending." });
        }

        let newStage = investment.stage;
        let newStatus = investment.status;

        if (action === 'reject') {
            newStage = 'rejected';
            newStatus = 'rejected';
        } else if (action === 'approve') {
            if (investment.stage === 'submitted') {
                if (role !== 'customer_experience' && role !== 'super_admin') return res.status(403).json({ message: "Only Customer Experience can approve at this stage." });
                newStage = 'compliance_review';
            } else if (investment.stage === 'compliance_review') {
                if (role !== 'compliance' && role !== 'super_admin') return res.status(403).json({ message: "Only Compliance can approve at this stage." });
                newStage = 'finance_review';
            } else if (investment.stage === 'finance_review') {
                if (role !== 'finance' && role !== 'super_admin') return res.status(403).json({ message: "Only Finance can approve at this stage." });
                newStage = 'active';
                newStatus = 'active';
            } else {
                return res.status(400).json({ message: "Invalid stage for approval." });
            }
        }

        if (newStatus === 'active') {
            await pool.query(`
                UPDATE investments 
                SET stage = $1, status = $2, start_date = CURRENT_TIMESTAMP, maturity_date = CURRENT_TIMESTAMP + (tenure_days || ' days')::interval 
                WHERE id = $3
            `, [newStage, newStatus, id]);

            // If the investment is becoming active but casa_account_number is missing, alert the CX team.
            if (!investment.casa_account_number) {
                try {
                    const cxRes = await pool.query(`SELECT email FROM staff WHERE role = 'customer_experience' AND is_active = true`);
                    const cxEmails = cxRes.rows.map(r => r.email);
                    if (cxEmails.length > 0) {
                        const applicantName = investment.company_name || investment.rep_full_name || investment.customer_name || 'Individual';
                        await zeptoService.sendCASARequestNotification(cxEmails, id as string, applicantName);
                    }
                } catch (emailErr) {
                    console.error("Failed to sequence CASA email request:", emailErr);
                }
            } else {
                // CASA is already present! Fire the certificate immediately since it just became active
                try {
                    // Fetch full investment details after update for precise numbers
                    const updatedInvRes = await pool.query(`
                        SELECT i.*, 
                               c.email as cust_email, c.first_name || ' ' || c.last_name as cust_name 
                        FROM investments i 
                        LEFT JOIN customers c ON i.customer_id = c.id 
                        WHERE i.id = $1
                    `, [id]);
                    const upInv = updatedInvRes.rows[0];

                    const customerName = upInv.cust_name || upInv.company_name || upInv.rep_full_name || upInv.customer_name || 'Individual';
                    const emailToSend = upInv.cust_email || upInv.customer_email || 'example@noltfinance.com';

                    const valDate = new Date(upInv.start_date || upInv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const matDate = new Date(upInv.maturity_date || Date.now() + 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                    const principal = Number(upInv.investment_amount || 0);
                    const interestAmt = Number(upInv.interest_amount || 0);
                    const whtAmt = Number(upInv.wht_amount || 0);
                    const maturityValue = principal + interestAmt - whtAmt;

                    const principalStr = principal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const interestAmtStr = interestAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const whtAmtStr = whtAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    const maturityValueStr = maturityValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                    const emailResult = await zeptoService.sendInvestmentCertificateWithCASA(emailToSend, customerName, upInv.casa_account_number, {
                        principal: principalStr,
                        tenure: upInv.tenure_days || 0,
                        interestRate: upInv.interest_rate || 0,
                        valueDate: valDate,
                        maturityDate: matDate,
                        interestAmount: interestAmtStr,
                        whtAmount: whtAmtStr,
                        maturityValue: maturityValueStr,
                        investmentType: upInv.investment_type || 'NOLT Investment',
                        id: id as string
                    });

                    console.log(`[Cert Trigger] Certificate dispatch successful for ${id} upon approval. Result:`, emailResult);
                } catch (certError) {
                    console.error("[Cert Trigger Error] Failed to sequence Certificate emission upon approval:", certError);
                }
            }

        } else {
            await pool.query(`UPDATE investments SET stage = $1, status = $2 WHERE id = $3`, [newStage, newStatus, id]);
        }

        // Add Activity Logging for Investment Action
        await pool.query(
            `INSERT INTO investment_activities (investment_id, user_id, action_type, description, metadata) 
             VALUES ($1, $2, $3, $4, $5)`,
            [id, user.id, action, `${action === 'approve' ? 'Approved' : 'Rejected'} at ${investment.stage.replace(/_/g, ' ')}`, JSON.stringify({ old_stage: investment.stage, new_stage: newStage })]
        );

        // Notify next stage role for Investments Pipeline
        if (newStatus === 'pending' && investment.stage !== newStage) {
            let roleToNotify = null;
            if (newStage === 'compliance_review') roleToNotify = 'compliance';
            else if (newStage === 'finance_review') roleToNotify = 'finance';

            if (roleToNotify) {
                try {
                    const notifyRes = await pool.query(`SELECT email FROM customers WHERE role = $1 AND is_active = true`, [roleToNotify]);
                    const emails = notifyRes.rows.map(r => r.email);
                    if (emails.length > 0) {
                        const applicantName = investment.company_name || investment.rep_full_name || investment.cust_full_name || 'Individual';
                        await zeptoService.sendInvestmentNotification(emails, id as string, applicantName, `Action Required: Application awaiting ${newStage.replace('_', ' ')} approval.`);
                    }
                } catch (emailErr) {
                    console.error("Failed to send stage notification email:", emailErr);
                }
            }
        }

        // --- Notify Customer of Stage Change ---
        if (investment.stage !== newStage || investment.status !== newStatus) {
            try {
                const customerEmail = investment.cust_email;
                const customerName = investment.company_name || investment.rep_full_name || investment.cust_full_name || 'Individual';
                if (customerEmail) {
                    await zeptoService.sendInvestmentStageUpdateEmail(customerEmail, customerName, id as string, newStage, newStatus);
                }
            } catch (custEmailErr) {
                console.error("Failed to send customer stage update email:", custEmailErr);
            }
        }

        res.json({ message: `Investment successfully ${action}d to ${newStage}` });
    } catch (error) {
        console.error("Error updating investment action:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/staff/investments/{id}/finance-fields:
 *   put:
 *     summary: Update Finance specific fields for an investment (Interest and derived WHT)
 */
router.put('/investments/:id/finance-fields', isAuthenticated, isStaff, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const role = req.user?.role?.toLowerCase();

        if (role !== 'finance' && role !== 'super_admin' && role !== 'superadmin') {
            return res.status(403).json({ message: "Only Finance can update these fields." });
        }

        const invRes = await pool.query('SELECT investment_amount, interest_rate, tenure_days, investment_type FROM investments WHERE id = $1', [id]);
        if (invRes.rows.length === 0) return res.status(404).json({ message: 'Investment not found' });

        const inv = invRes.rows[0];
        const principal = Number(inv.investment_amount) || 0;
        const rate = Number(inv.interest_rate) || 0;
        const tenureDays = Number(inv.tenure_days) || 0;
        const type = inv.investment_type || '';

        const inputInterest = Number(req.body.interest_amount) || 0;
        let validInterest = 0;

        const isSurge = type.includes('SURGE');
        const isRiseOrVault = type.includes('RISE') || type.includes('VAULT');

        if (inputInterest > 0) {
            // Explicit manual override wins
            validInterest = inputInterest;
        } else if (isSurge) {
            // Compound every 30 days
            let balance = principal;
            let daysRemaining = tenureDays;
            let totalGrossInterest = 0;

            while (daysRemaining >= 30) {
                const periodInterest = balance * (rate / 100) * (30 / 365);
                const periodWht = periodInterest * 0.10;
                totalGrossInterest += periodInterest;
                balance += (periodInterest - periodWht);
                daysRemaining -= 30;
            }
            if (daysRemaining > 0) {
                const periodInterest = balance * (rate / 100) * (daysRemaining / 365);
                const periodWht = periodInterest * 0.10;
                totalGrossInterest += periodInterest;
                balance += (periodInterest - periodWht);
            }
            validInterest = totalGrossInterest;
        } else if (isRiseOrVault) {
            // Simple interest
            validInterest = principal * (rate / 100) * (tenureDays / 365);
        } else {
            // Base fallback
            validInterest = principal * (rate / 100) * (tenureDays / 365);
        }

        validInterest = Math.round(validInterest * 100) / 100;
        const wht_amount = Math.round(validInterest * 0.10 * 100) / 100;

        await pool.query(
            `UPDATE investments SET interest_amount = $1, wht_amount = $2 WHERE id = $3`,
            [validInterest, wht_amount, id]
        );

        await pool.query(
            `INSERT INTO investment_activities (investment_id, user_id, action_type, description, metadata) 
             VALUES ($1, $2, $3, $4, $5)`,
            [id, req.user?.id, 'finance_override', `Updated interest amount to ₦${validInterest.toLocaleString()} and WHT to ₦${wht_amount.toLocaleString()}`, JSON.stringify({ interest_amount: validInterest, wht_amount: wht_amount })]
        );

        res.json({ message: "Finance fields safely processed and updated", interest_amount: validInterest, wht_amount });
    } catch (error) {
        console.error("Error updating finance fields:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/staff/investments/{id}/casa:
 *   put:
 *     summary: Update CASA Account Number for an investment
 */
router.put('/investments/:id/casa', isAuthenticated, isStaff, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { casa_account_number } = req.body;

        if (!casa_account_number) {
            return res.status(400).json({ message: "CASA Account Number is required." });
        }

        const invRes = await pool.query(
            `UPDATE investments SET casa_account_number = $1 WHERE id = $2 RETURNING *`,
            [casa_account_number, id]
        );

        if (invRes.rows.length === 0) {
            return res.status(404).json({ message: "Investment not found." });
        }

        await pool.query(
            `INSERT INTO investment_activities (investment_id, user_id, action_type, description, metadata) 
             VALUES ($1, $2, $3, $4, $5)`,
            [id, req.user?.id, 'casa_posting', `Assigned CASA account number ${casa_account_number}`, JSON.stringify({ casa_account_number })]
        );

        // Fetch investment with customer details to ensure email availability
        const detailedInvRes = await pool.query(`
            SELECT i.*, c.full_name as cust_name, c.email as cust_email
            FROM investments i
            LEFT JOIN customers c ON i.customer_id = c.id
            WHERE i.id = $1
        `, [id]);

        const investment = detailedInvRes.rows[0];

        console.log(`[CASA Update] Investment ID: ${id}. Current Status: ${investment.status}. CASA: ${casa_account_number}`);

        // If investment is currently active, fire the certificate immediately
        if (investment.status === 'active') {
            try {
                const customerName = investment.cust_name || investment.company_name || investment.rep_full_name || investment.customer_name || 'Individual';

                // Construct Date Strings
                const valDate = new Date(investment.start_date || investment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const matDate = new Date(investment.maturity_date || Date.now() + 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                const principal = Number(investment.investment_amount || 0);
                const interestAmt = Number(investment.interest_amount || 0);
                const whtAmt = Number(investment.wht_amount || 0);
                const maturityValue = principal + interestAmt - whtAmt;

                const emailToSend = investment.cust_email || investment.customer_email || 'example@noltfinance.com';

                console.log(`[Cert Trigger] Attempting to send certificate to: ${emailToSend} (Customer: ${customerName})`);

                const principalStr = principal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const interestAmtStr = interestAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const whtAmtStr = whtAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                const maturityValueStr = maturityValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                const emailResult = await zeptoService.sendInvestmentCertificateWithCASA(emailToSend, customerName, casa_account_number, {
                    principal: principalStr,
                    tenure: investment.tenure_days || 0,
                    interestRate: investment.interest_rate || 0,
                    valueDate: valDate,
                    maturityDate: matDate,
                    interestAmount: interestAmtStr,
                    whtAmount: whtAmtStr,
                    maturityValue: maturityValueStr,
                    investmentType: investment.investment_type || 'NOLT Investment',
                    id: String(id)
                });

                console.log(`[Cert Trigger] Certificate dispatch successful for ${id}. Result:`, emailResult);

            } catch (certError) {
                console.error("[Cert Trigger Error] Failed to sequence Certificate emission after CASA save:", certError);
            }
        } else {
            console.log(`[CASA Update] Investment ${id} status is NOT 'active' (Actual: '${investment.status}'). Skipping certificate email.`);
        }

        res.json({ message: "CASA Account Number set successfully.", casa_account_number });
    } catch (error) {
        console.error("Error updating CASA fields:", error);
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
                l.loan_type, l.topup_amount, l.buy_over_amount, l.disb_date,
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
 * /api/staff/users:
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
            if (role === 'unassigned') {
                filters.push(`c.role IS NULL`);
            } else {
                filters.push(`c.role = $${paramIndex++}`);
                params.push(role);
            }
        }

        if (exclude_role) {
            filters.push(`(c.role != $${paramIndex++} OR c.role IS NULL)`);
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
                l.account_name,
                l.gender,
                l.marital_status,
                l.religion,
                l.state_of_origin,
                l.residential_status,
                l.ippis_number,
                l.staff_id,
                l.average_monthly_income,
                l.mda_tertiary
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
                up.bank_name as up_bank, up.account_number as up_account, up.account_name as up_name,
                up.bank_statement_url, up.is_corporate_account, up.bank_verified,
                up.bvn as up_bvn, up.nin as up_nin, up.date_of_birth as up_dob, up.phone_number as up_phone,
                up.is_identity_verified, 
                COALESCE(l.selfie_verification_url, inv.rep_selfie_url) as selfie_verification_url,
                l.mobile_number, l.state_of_residence, l.mda_tertiary as employer,
                COALESCE(up.bvn, l.bvn, inv.rep_bvn) as bvn, 
                COALESCE(up.nin, l.nin, inv.rep_nin) as nin, 
                COALESCE(up.date_of_birth, l.date_of_birth, inv.dob) as date_of_birth, 
                COALESCE(l.primary_home_address, inv.company_address) as primary_home_address,
                COALESCE(up.bank_name, l.bank_name) as bank_name, 
                COALESCE(up.account_number, l.account_number) as account_number, 
                COALESCE(up.account_name, l.account_name) as account_name,
                COALESCE(l.gender, inv.gender) as gender, 
                COALESCE(l.marital_status, inv.marital_status) as marital_status, 
                COALESCE(l.religion, inv.religion) as religion, 
                COALESCE(l.state_of_origin, inv.rep_state_of_origin) as state_of_origin,
                l.residential_status, l.ippis_number, l.staff_id,
                l.average_monthly_income, l.mda_tertiary,
                p.utm_source as promotion_source, p.utm_medium as promotion_medium, p.utm_campaign as promotion_campaign,
                m.hear_about_us, m.referral_code as marketing_referral, m.officer_name as marketing_officer
            FROM customers c
            LEFT JOIN user_profiles up ON c.id = up.user_id
            LEFT JOIN (SELECT * FROM loans WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1) l ON c.id = l.customer_id
            LEFT JOIN (SELECT * FROM investments WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1) inv ON c.id = inv.customer_id
            LEFT JOIN promotions p ON (p.utm_campaign IN (COALESCE(l.referral_code, inv.referral_code)) OR p.unique_code IN (COALESCE(l.referral_code, inv.referral_code)))
            LEFT JOIN marketing m ON c.id = m.customer_id
            WHERE c.id = $1
        `, [id]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: "Customer not found" });
        }

        const user = userResult.rows[0];

        // Fetch Loans
        const loansResult = await pool.query(`
            SELECT * FROM loans WHERE customer_id = $1 ORDER BY created_at DESC
        `, [id]);

        // Fetch Investments
        const investmentsResult = await pool.query(`
            SELECT * FROM investments WHERE customer_id = $1 ORDER BY created_at DESC
        `, [id]);

        // Aggregate Documents from Loans & Investments (deduplicated by URL)
        const documents: { type: string; url: string; date: string }[] = [];
        const seenUrls = new Set();
        
        const loanDocTypes = ['govt_id_url', 'work_id_url', 'payslip_url', 'statement_of_account_url', 'proof_of_residence_url', 'selfie_verification_url'];
        const invDocTypes = [
            'cac_url', 'director_1_id_url', 'director_2_id_url', 'rep_selfie_url', 'rep_id_url', 
            'memart_url', 'annual_returns_url', 'board_resolution_url', 'aml_cft_url',
            'utility_bill_url', 'secondary_id_url', 'company_profile_url', 'status_report_url'
        ];

        loansResult.rows.forEach((loan: any) => {
            loanDocTypes.forEach(type => {
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

        investmentsResult.rows.forEach((inv: any) => {
            invDocTypes.forEach(type => {
                if (inv[type] && !seenUrls.has(inv[type])) {
                    seenUrls.add(inv[type]);
                    documents.push({
                        type: type.replace('_url', '').replace(/_/g, ' ').toUpperCase(),
                        url: inv[type],
                        date: inv.created_at
                    });
                }
            });
        });

        res.json({
            profile: user,
            loans: loansResult.rows,
            investments: investmentsResult.rows,
            documents
        });

    } catch (error) {
        console.error("Error fetching customer details:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/staff/customers/{id}/verify-bank:
 *   put:
 *     summary: Admin overrides and verifies a customer's bank details manually
 *     tags: [Staff]
 */
router.put('/customers/:id/verify-bank', isStaff, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            UPDATE user_profiles 
            SET bank_verified = true 
            WHERE user_id = $1 
            RETURNING *
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "User profile not found" });
        }

        res.json({ success: true, message: "Bank Details manually verified." });
    } catch (error) {
        console.error("Error verifying customer bank:", error);
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
    const role = (req.user as any)?.role?.toLowerCase?.() || '';
    try {
        const loans = await pool.query(`
            SELECT 
                l.id, l.applicant_full_name, l.requested_loan_amount, l.created_at, l.status, l.stage, l.product_type,
                l.surname, l.first_name, l.middle_name, -- Added individual name fields
                l.gender, l.date_of_birth, l.marital_status, l.religion, l.mothers_maiden_name, l.is_politically_exposed, l.title,
                l.mobile_number, l.personal_email, l.primary_home_address, l.residential_status, l.state_of_residence, l.state_of_origin,
                l.average_monthly_income, l.number_of_dependents, l.has_active_loans,
                l.mda_tertiary, l.ippis_number, l.staff_id, l.indemnity_document_url,
                l.govt_id_url, l.statement_of_account_url, l.proof_of_residence_url, l.selfie_verification_url,
                l.work_id_url, l.payslip_url, -- Added missing docs
                l.customer_references, l.signatures, l.updated_at, l.eligible_amount, l.sales_officer_id,
                l.bvn, l.nin, -- Unmasked for editing
                l.apply_management_fee, l.apply_insurance_fee, l.disbursement_amount, -- Disbursement Logic
                l.existing_loan_balance, -- Added for Top-Up/Add-On/Re-App
                l.bank_name, l.account_number, l.loan_tenure_months, l.account_name, -- Added bank details
                l.loan_type, -- Added loan type
                
                -- New Fields for TopUp/BuyOver
                l.disb_date,
                p.utm_source as promotion_source, p.utm_medium as promotion_medium, p.utm_campaign as promotion_campaign,
                m.hear_about_us, m.referral_code as marketing_referral, m.officer_name as marketing_officer,
                up.is_identity_verified, l.buy_over_amount, l.topup_amount, l.casa, 
                l.buy_over_company_name, l.buy_over_company_account_name, l.buy_over_company_account_number,    

                c.full_name as officer_name, c.email as officer_email, c.avatar_url as officer_avatar
            FROM loans l
            LEFT JOIN customers c ON l.sales_officer_id = c.id
            LEFT JOIN promotions p ON l.referral_code = p.utm_campaign OR l.referral_code = p.unique_code
            LEFT JOIN marketing m ON l.customer_id = m.customer_id
            LEFT JOIN user_profiles up ON l.customer_id = up.user_id
            WHERE l.id = $1
            LIMIT 1
        `, [id]);

        if (loans.rows.length === 0) {
            return res.status(404).json({ message: "Loan not found" });
        }
        if (role === 'marketing' && !loans.rows[0].promotion_source) {
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

    // --- Sanitize and Validate Input Fields Before Destructuring ---
    const sanitizePayload = (payload: any) => {
        const sanitized: any = {};
        for (const [key, val] of Object.entries(payload)) {
            if (val === 'null' || val === 'undefined' || val === '' || val === null || val === undefined) {
                sanitized[key] = null;
            } else if (typeof val === 'string') {
                sanitized[key] = val.trim();
            } else {
                sanitized[key] = val;
            }
        }
        return sanitized;
    };

    req.body = sanitizePayload(req.body);

    const numericFields = ['average_monthly_income', 'requested_loan_amount', 'loan_tenure_months', 'casa', 'topup_amount', 'buy_over_amount'];
    for (const field of numericFields) {
        if (req.body[field] !== null && req.body[field] !== undefined) {
            const num = Number(req.body[field]);
            if (isNaN(num)) {
                return res.status(400).json({ message: `Invalid input for ${field.replace(/_/g, ' ')}. Expected a valid number.` });
            }
            req.body[field] = num;
        }
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

        // Bank Details
        bank_name, account_number, account_name,

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
                bank_name = $38, account_number = $39, account_name = $40,

                updated_at = NOW()
            WHERE id = $41`,
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
                bank_name || null, account_number || null, account_name || null,

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

    } catch (error: any) {
        console.error("Error updating loan:", error);
        res.status(500).json({
            message: "Error updating loan. Please check your inputs or try again.",
            details: error.message
        });
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
    let { action, data, reason } = req.body; // data may contain eligible_amount, tenure, target_stage, fees
    // @ts-ignore
    const user = req.user as any;

    if (!user) return res.status(401).json({ message: "Unauthorized" });

    // --- Validate and Sanitize Numeric Data Fields ---
    if (data && typeof data === 'object') {
        const dataNumericFields = ['eligible_amount', 'tenure', 'disbursement_amount', 'existing_loan_balance', 'buy_over_amount'];
        for (const field of dataNumericFields) {
            if (data[field] !== undefined && data[field] !== null && data[field] !== '' && data[field] !== 'null') {
                const num = Number(data[field]);
                if (isNaN(num)) {
                    return res.status(400).json({ message: `Invalid input for ${field.replace(/_/g, ' ')}. Expected a valid number.` });
                }
                data[field] = num;
            } else {
                // If it's missing or intentionally null, delete it so it's undefined
                delete data[field];
            }
        }
    }

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
                if (data?.eligible_amount !== undefined) {
                    updates.push(`eligible_amount = $${paramIndex++}`);
                    values.push(data.eligible_amount);
                }
                if (data?.tenure !== undefined) {
                    updates.push(`loan_tenure_months = $${paramIndex++}`);
                    values.push(data.tenure);
                }
                // Save Disbursement Logic
                if (data?.apply_management_fee !== undefined) {
                    updates.push(`apply_management_fee = $${paramIndex++}`);
                    values.push(data.apply_management_fee);
                }
                if (data?.apply_insurance_fee !== undefined) {
                    updates.push(`apply_insurance_fee = $${paramIndex++}`);
                    values.push(data.apply_insurance_fee);
                }
                if (data?.disbursement_amount !== undefined) {
                    updates.push(`disbursement_amount = $${paramIndex++}`);
                    values.push(data.disbursement_amount);
                }
                if (data?.existing_loan_balance !== undefined) {
                    updates.push(`existing_loan_balance = $${paramIndex++}`);
                    values.push(data.existing_loan_balance);
                }
                if (data?.buy_over_amount !== undefined) {
                    updates.push(`buy_over_amount = $${paramIndex++}`);
                    values.push(data.buy_over_amount);
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
                if (data?.eligible_amount === undefined && !loan.eligible_amount) {
                    return res.status(400).json({ message: "Eligible amount is required for approval." });
                }
                if (data?.eligible_amount !== undefined) {
                    updates.push(`eligible_amount = $${paramIndex++}`);
                    values.push(data.eligible_amount);
                }
                if (data?.tenure !== undefined) {
                    updates.push(`loan_tenure_months = $${paramIndex++}`);
                    values.push(data.tenure);
                }
                // Save Disbursement Logic
                if (data?.apply_management_fee !== undefined) {
                    updates.push(`apply_management_fee = $${paramIndex++}`);
                    values.push(data.apply_management_fee);
                }
                if (data?.apply_insurance_fee !== undefined) {
                    updates.push(`apply_insurance_fee = $${paramIndex++}`);
                    values.push(data.apply_insurance_fee);
                }
                if (data?.disbursement_amount !== undefined) {
                    updates.push(`disbursement_amount = $${paramIndex++}`);
                    values.push(data.disbursement_amount);
                }
                if (data?.existing_loan_balance !== undefined) {
                    updates.push(`existing_loan_balance = $${paramIndex++}`);
                    values.push(data.existing_loan_balance);
                }
                if (data?.buy_over_amount !== undefined) {
                    updates.push(`buy_over_amount = $${paramIndex++}`);
                    values.push(data.buy_over_amount);
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
            if (action === 'approve') {
                nextStage = 'finance';
                // Automatically set status to 'approved' when moving to Finance
                updates.push(`status = $${paramIndex++}`);
                values.push('approved');
                updates.push(`disb_date = CURRENT_TIMESTAMP`);
            }
            if (action === 'return') {
                nextStage = getReturnStage('credit_check_2');
                // Ensure status is 'pending' if returned
                updates.push(`status = $${paramIndex++}`);
                values.push('pending');
            }
        }

        // 5. Finance -> Disbursed (Final Approval)
        else if (currentStage === 'finance' || currentStage === 'finance_stage') {
            if (!canAct('finance', currentStage)) {
                return res.status(403).json({ message: "Only Finance can process this stage" });
            }
            if (action === 'approve') {
                nextStage = 'disbursed';
                updates.push(`status = $${paramIndex++}`); // Final status
                values.push('disbursed');
                
                // Allow finance to update the buy_over_amount directly before disbursement
                if (data?.buy_over_amount !== undefined) {
                    updates.push(`buy_over_amount = $${paramIndex++}`);
                    values.push(data.buy_over_amount);
                }
            }
            if (action === 'return') {
                nextStage = getReturnStage('internal_audit');
                // Ensure status is 'pending' if returned to any stage before finance
                updates.push(`status = $${paramIndex++}`);
                values.push('pending');
            }
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
                        await zeptoService.sendStageNotification([officer.email], id, stageForEmail);
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
                    status: (action === 'reject' ? 'rejected' :
                        nextStage === 'disbursed' ? 'disbursed' :
                            nextStage === 'finance' ? 'approved' : 'pending'),
                    updatedBy: user.email,
                    timestamp: new Date()
                });
            } catch (e) {
                console.error("Socket emit failed:", e);
            }

            return res.json({ message: action === 'reject' ? "Loan rejected" : `Loan moved to ${nextStage}`, stage: nextStage || 'rejected' });
        }

        res.status(400).json({ message: "Action could not be completed." });

    } catch (error: any) {
        console.error("Error processing loan action:", error);
        res.status(500).json({
            message: "Error processing loan action. Please try again.",
            details: error.message
        });
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

    // --- Sanitize and Validate Input Fields Before Destructuring ---
    const sanitizePayload = (payload: any) => {
        const sanitized: any = {};
        for (const [key, val] of Object.entries(payload)) {
            if (val === 'null' || val === 'undefined' || val === '' || val === null || val === undefined) {
                sanitized[key] = null;
            } else if (typeof val === 'string') {
                sanitized[key] = val.trim();
            } else {
                sanitized[key] = val;
            }
        }
        return sanitized;
    };

    req.body = sanitizePayload(req.body);

    const numericFields = ['average_monthly_income', 'requested_loan_amount', 'loan_tenure_months', 'casa', 'topup_amount', 'buy_over_amount'];
    for (const field of numericFields) {
        if (req.body[field] !== null && req.body[field] !== undefined) {
            const num = Number(req.body[field]);
            if (isNaN(num)) {
                return res.status(400).json({ message: `Invalid input for ${field.replace(/_/g, ' ')}. Expected a valid number.` });
            }
            req.body[field] = num;
        }
    }

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

        // 0. Check for existing active loans with the same BVN
        if (bvn) {
            const activeLoanCheck = await pool.query(
                "SELECT id FROM loans WHERE bvn = $1 AND status NOT IN ('rejected') LIMIT 1",
                [bvn]
            );
            if (activeLoanCheck.rows.length > 0) {
                return res.status(400).json({
                    message: `A client with this BVN already has an active or pending loan (Loan ID: ${activeLoanCheck.rows[0].id}).`
                });
            }
        }

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

    } catch (error: any) {
        console.error("Error creating loan application:", error);
        res.status(500).json({
            message: "Error creating loan application. Please check your inputs or try again.",
            details: error.message
        });
    }
});

/**
 * @swagger
 * /api/staff/investments/application:
 *   post:
 *     summary: Create a new investment application (Individual/Corporate) by Staff
 *     tags: [Staff]
 */
router.post('/investments/application', isStaff, async (req, res) => {
    const user = req.user as any;
    const userRole = user?.role?.toLowerCase();
    const officerId = user?.id;
    if (!officerId) return res.status(401).json({ message: "Unauthorized" });

    // --- Sanitize and Validate Input Fields ---
    const sanitizePayload = (payload: any) => {
        const sanitized: any = {};
        for (const [key, val] of Object.entries(payload)) {
            if (val === 'null' || val === 'undefined' || val === '' || val === null || val === undefined) {
                sanitized[key] = null;
            } else if (typeof val === 'string') {
                sanitized[key] = val.trim();
            } else {
                sanitized[key] = val;
            }
        }
        return sanitized;
    };

    req.body = sanitizePayload(req.body);

    const {
        entity_type,
        email, phone, fullName,
        selectedPlan, currency, amount, tenure_days,
        rollover_option, contribution_frequency, target_amount, interest_rate,

        // Identity
        title, gender, dob, marital_status, religion, mother_maiden_name,

        // Corporate
        companyName, rcNumber, businessAddress, businessNature, tin, directors,
        incorp_date,

        // Address & NOK
        homeAddress, stateOfOrigin, stateOfResidence,
        nokName, nokRelationship, nokAddress,

        // Bank Recovery
        bankName, accountName, accountNumber,

        // URLs
        rep_id_url, kyc_docs_url, rep_selfie_url, payment_receipt_url,
        utility_bill_url, secondary_id_url, cac_url,
        company_profile_url, status_report_url, memart_url, annual_returns_url, board_resolution_url,

        // Payment Source
        payment_method, payment_reference
    } = req.body;

    if (!email || !amount || !selectedPlan) {
        return res.status(400).json({ message: "Email, amount, and plan are required." });
    }

    try {
        // 1. Resolve/Create Customer
        let customerId;
        const checkCustomer = await pool.query('SELECT id FROM customers WHERE email = $1 LIMIT 1', [email]);

        if (checkCustomer.rows.length > 0) {
            customerId = checkCustomer.rows[0].id;
        } else {
            const tempPassword = Math.random().toString(36).slice(-8);
            const hashedPassword = await bcrypt.hash(tempPassword, 10);
            const newCustomer = await pool.query(
                `INSERT INTO customers (email, full_name, role, is_active, password_hash) 
                 VALUES ($1, $2, 'customer', true, $3) RETURNING id`,
                [email, companyName || fullName || 'Anonymous Client', hashedPassword]
            );
            customerId = newCustomer.rows[0].id;
        }

        // 1.5. Payout Bank Details Update (Store in Profile)
        if (bankName || accountNumber) {
            await pool.query(
                `INSERT INTO user_profiles (user_id, bank_name, account_number, account_name, updated_at)
                 VALUES ($1, $2, $3, $4, NOW())
                 ON CONFLICT (user_id) DO UPDATE SET 
                    bank_name = EXCLUDED.bank_name,
                    account_number = EXCLUDED.account_number,
                    account_name = EXCLUDED.account_name,
                    updated_at = NOW()`,
                [customerId, bankName, accountNumber, accountName]
            );
        }

        // 2. Create Investment Application
        const newInvestment = await pool.query(
            `INSERT INTO investments (
                customer_id, sales_officer_id, investment_type, entity_type,
                company_name, business_address, date_of_incorporation,
                rep_full_name, rep_phone_number, rep_bvn, rep_nin,
                rep_state_of_origin, rep_state_of_residence, rep_street_address,
                investment_amount, tenure_days, currency,
                rollover_option, contribution_frequency, interest_rate, stage, 
                status,
                
                title, gender, dob, mother_maiden_name, religion, marital_status,
                nok_name, nok_relationship, nok_address,
                target_amount, tin, business_nature, rc_number, directors,
                
                -- URLs
                rep_id_url, rep_selfie_url, payment_receipt_url,
                company_profile_url, status_report_url, memart_url, annual_returns_url, board_resolution_url,
                utility_bill_url, secondary_id_url, cac_url,

                payment_reference,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 
                'pending',
                $22, $23, $24, $25, $26, $27, $28, $29, $30,
                $31, $32, $33, $34, $35,
                $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47,
                NOW(), NOW()
            ) RETURNING id`,
            [
                customerId,
                officerId,
                `NOLT_${selectedPlan}`, // Prefix required by check constraint
                entity_type || 'INDIVIDUAL',
                companyName, businessAddress, incorp_date || null,
                fullName, phone, req.body.bvn || null, req.body.nin || null,
                stateOfOrigin, stateOfResidence, homeAddress,
                amount, tenure_days || 365, currency || 'NGN',
                rollover_option || 'principal_interest', contribution_frequency || 'monthly',
                interest_rate || 0,
                payment_receipt_url ? 'compliance_review' : 'onboarding', // stage is $21

                title, gender, dob, mother_maiden_name, religion, marital_status,
                nokName, nokRelationship, nokAddress,
                target_amount || null, tin, businessNature, rcNumber,
                JSON.stringify(directors || []),
                // URLs starting at $36
                rep_id_url || null,
                rep_selfie_url || null,
                payment_receipt_url || null,
                company_profile_url || null,
                status_report_url || null,
                memart_url || null,
                annual_returns_url || null,
                board_resolution_url || null,
                utility_bill_url || null,
                secondary_id_url || null,
                cac_url || null,
                payment_reference || null
            ]
        );

        // 2.5 Log Activity for Timeline (Staff Initiated)
        await pool.query(
            `INSERT INTO investment_activities (investment_id, user_id, action_type, description, metadata)
             VALUES ($1, $2, 'staff_application', $3, $4)`,
            [
                newInvestment.rows[0].id,
                officerId,
                'Investment application created by staff',
                JSON.stringify({
                    amount: amount,
                    currency: currency,
                    plan: selectedPlan,
                    staff_id: officerId,
                    staff_role: userRole
                })
            ]
        );

        // 3. Emit Socket Event
        const io = getIO();
        io.emit('investment_new', { id: newInvestment.rows[0].id, customer_id: customerId });

        // 4. Send Confirmation Email to Customer
        try {
            await zeptoService.sendInvestmentSuccessEmail(email, companyName || fullName || 'Individual', newInvestment.rows[0].id, amount);
        } catch (emailErr) {
            console.error("Failed to send investment success email:", emailErr);
        }

        res.status(201).json({
            message: "Investment application created successfully",
            investment_id: newInvestment.rows[0].id,
            account_status: checkCustomer.rows.length > 0 ? 'existing' : 'new_created'
        });

    } catch (error) {
        console.error("Error creating investment application via staff:", error);
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

    // Permission Check: Sales Manager, Admin, Super Admin, Customer Experience, Marketing
    const allowedRoles = ['sales_manager', 'admin', 'super_admin', 'superadmin', 'customer_experience', 'marketing'];
    if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ message: "Only Managers, Admins, Marketing and CX can reassign loans." });
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
            await zeptoService.sendStageNotification([newOfficer.email], id, 'assigned');
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

    } catch (error: any) {
        console.error(`Error updating ${field}:`, error);
        res.status(500).json({
            message: "Error updating attribute. Please try again.",
            details: error.message
        });
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
                l.disb_date,
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
                            // We can't use emailService directly inside transaction easily without holding connection.
                            // Let's just fire and forget or await. Await is safer for flow control.
                            await zeptoService.sendStageNotification([officer.email], loan.id, 'disbursed');
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

    } catch (error: any) {
        console.error("Error in bulk approval:", error);
        res.status(500).json({
            message: "Error processing bulk approval. Please try again.",
            details: error.message
        });
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
    } catch (error: any) {
        console.error("Error fetching assigned loans:", error);
        res.status(500).json({
            message: "Error fetching assigned loans.",
            details: error.message
        });
    }
});

/**
 * @swagger
 * /api/staff/investments/{id}/liquidate-action:
 *   post:
 *     summary: Progress a liquidation request based on admin role
 *     tags: [Investments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               action: { type: string, enum: [APPROVE, REJECT] }
 *               note: { type: string }
 */
router.post('/investments/:id/liquidate-action', isStaff, async (req: any, res: any) => {
    try {
        const id = parseInt(req.params.id);
        const { action, note } = req.body;
        const role = req.user.role.toLowerCase();

        if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
        if (!['APPROVE', 'REJECT'].includes(action)) return res.status(400).json({ message: "Invalid action" });

        const invRes = await pool.query('SELECT * FROM investments WHERE id = $1', [id]);
        if (invRes.rows.length === 0) return res.status(404).json({ message: "Investment not found" });

        const inv = invRes.rows[0];

        if (!inv.is_liquidating) {
            return res.status(400).json({ message: "This investment does not have an active liquidation request." });
        }

        // Validate role against current stage
        const stage = inv.liquidation_stage;

        if (action === 'REJECT') {
            await pool.query(
                `UPDATE investments SET is_liquidating = false, liquidation_stage = null WHERE id = $1`, [id]
            );
            await pool.query(
                `INSERT INTO investment_activities (investment_id, user_id, action_type, description, metadata) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [id, req.user.id, 'reject', `Rejected liquidation request at ${stage.replace(/_/g, ' ')}`, JSON.stringify({ note })]
            );
            return res.json({ success: true, message: `Liquidation request rejected by ${role}` });
        }

        let nextStage = '';
        if (stage === 'customer_experience') {
            if (role !== 'super_admin' && role !== 'customer_experience') return res.status(403).json({ message: "Only CX can approve this stage." });
            nextStage = 'internal_audit';
        } else if (stage === 'internal_audit') {
            if (role !== 'super_admin' && role !== 'internal_audit') return res.status(403).json({ message: "Only Audit can approve this stage." });

            // Branching Logic for MD
            const rawAmount = Number(inv.liquidation_requested_amount);
            if (rawAmount > 1000000) {
                nextStage = 'md';
            } else {
                nextStage = 'finance';
            }
        } else if (stage === 'md') {
            if (role !== 'super_admin' && role !== 'md') return res.status(403).json({ message: "Only MD can approve this stage." });
            nextStage = 'finance';
        } else if (stage === 'finance') {
            if (role !== 'super_admin' && role !== 'finance') return res.status(403).json({ message: "Only Finance can approve this stage." });

            // FINAL EXECUTION
            const requested = Number(inv.liquidation_requested_amount);
            const penalty = Number(inv.liquidation_penalty_amount || 0);
            const totalDeduction = requested + penalty;

            const remainingBalance = Number(inv.investment_amount) - totalDeduction;
            let finalStatus = inv.status;

            if (inv.liquidation_type === 'FULL' || remainingBalance <= 0) {
                finalStatus = 'liquidated';
            }

            await pool.query(
                `UPDATE investments 
                 SET investment_amount = GREATEST($1, 0),
                     is_liquidating = false,
                     liquidation_stage = 'completed',
                     status = $2
                 WHERE id = $3`,
                [remainingBalance, finalStatus, id]
            );

            await pool.query(
                `INSERT INTO investment_activities (investment_id, user_id, action_type, description, metadata) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [id, req.user.id, 'approve', `Finalized liquidation at finance`, JSON.stringify({ note, payout: remainingBalance })]
            );

            return res.json({ success: true, message: "Liquidation fully processed and finalized." });
        } else {
            return res.status(400).json({ message: "Invalid liquidation stage." });
        }

        // Move to next stage
        await pool.query(
            `UPDATE investments SET liquidation_stage = $1 WHERE id = $2`, [nextStage, id]
        );

        await pool.query(
            `INSERT INTO investment_activities (investment_id, user_id, action_type, description, metadata) 
             VALUES ($1, $2, $3, $4, $5)`,
            [id, req.user.id, 'approve', `Approved liquidation request at ${stage.replace(/_/g, ' ')}`, JSON.stringify({ note, new_stage: nextStage })]
        );

        // Notify next stage role for Liquidation Pipeline
        if (nextStage) {
            try {
                const notifyRes = await pool.query(`SELECT email FROM customers WHERE role = $1 AND is_active = true`, [nextStage]);
                const emails = notifyRes.rows.map(r => r.email);
                if (emails.length > 0) {
                    const applicantName = inv.company_name || inv.rep_full_name || inv.customer_name || 'Individual';
                    await zeptoService.sendInvestmentNotification(emails, id.toString(), applicantName, `Liquidation Workflow: Awaiting ${nextStage.replace(/_/g, ' ')} approval.`);
                }
            } catch (emailErr) {
                console.error("Failed to send liquidation stage notification:", emailErr);
            }
        }

        res.json({ success: true, message: `Liquidation approved and moved to ${nextStage}` });
    } catch (error: any) {
        console.error("Liquidation Action Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
import { Router } from 'express';
import pool from '../config/db.js';
import { zeptoService as resendService } from '../services/zeptoService.js';
import { getIO } from '../socket.js';

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
router.get('/me', async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            // @ts-ignore
            const userId = req.user.id;

            // Fetch marketing data to see if referral code was used
            const marketingResult = await pool.query('SELECT referral_code FROM marketing WHERE customer_id = $1', [userId]);
            const marketingData = marketingResult.rows[0];

            // Merge with user object
            // @ts-ignore
            const userResponse = { ...req.user, referral_code_used: marketingData?.referral_code || null };
            console.log("DEBUG: /api/me called. Response:", userResponse);
            res.json(userResponse);
        } catch (error) {
            console.error("Error in /api/me:", error);
            res.json(req.user); // Fallback to basic user info
        }
    } else {
        res.status(401).json({ message: "Unauthorized" });
    }
});

/**
 * @swagger
 * /api/onboarding-complete:
 *   put:
 *     summary: Complete user onboarding
 *     tags: [Customers]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Onboarding completed successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
router.put('/onboarding-complete', async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            // @ts-ignore
            const userId = req.user.id;
            await pool.query('UPDATE customers SET new_comer = false WHERE id = $1', [userId]);

            // Update the session user object manually if needed, or rely on next fetch
            // @ts-ignore
            req.user.new_comer = false;
            res.json({ message: "Onboarding completed" });
        } catch (error) {
            console.error("Error updating onboarding status:", error);
            res.status(500).json({ message: "Internal Server Error" });
        }
    } else {
        res.status(401).json({ message: "Unauthorized" });
    }
});

/**
 * @swagger
 * /api/referral/{code}:
 *   get:
 *     summary: Check referral code
 *     tags: [Customers]
 *     parameters:
 *       - in: path
 *         name: code
 *         schema:
 *           type: string
 *         required: true
 *         description: The referral code to check
 *     responses:
 *       200:
 *         description: Referral code found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 full_name:
 *                   type: string
 *                 avatar_url:
 *                   type: string
 *       404:
 *         description: Referral code not found
 *       500:
 *         description: Internal Server Error
 */
// Check referral code
router.get('/referral/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const userResult = await pool.query('SELECT id, full_name, avatar_url FROM customers WHERE referral_code = $1', [code]);
        const user = userResult.rows[0];

        if (user) {
            res.json(user);
        } else {
            res.status(404).json({ message: "Referral code not found" });
        }
    } catch (error) {
        console.error("Error checking referral code:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

/**
 * @swagger
 * /api/marketing:
 *   post:
 *     summary: Submit marketing data (how did you hear about us)
 *     tags: [Customers]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               hear_about_us:
 *                 type: string
 *               referral_code:
 *                 type: string
 *               officer_name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Marketing data saved
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
// Create marketing entry
router.post('/marketing', async (req, res) => {
    console.log("DEBUG: /api/marketing hit", {
        isAuthenticated: req.isAuthenticated(),
        user: req.user,
        cookies: req.headers.cookie,
        session: req.session
    });

    if (req.isAuthenticated()) {
        try {
            const { hear_about_us, referral_code, officer_name } = req.body;
            // @ts-ignore
            const customerId = req.user.id;

            await pool.query(
                'INSERT INTO marketing (customer_id, hear_about_us, referral_code, officer_name) VALUES ($1, $2, $3, $4)',
                [customerId, hear_about_us, referral_code || null, officer_name || null]
            );

            res.status(201).json({ message: "Marketing data saved" });
        } catch (error) {
            console.error("Error saving marketing data:", error);
            res.status(500).json({ message: "Internal Server Error" });
        }
    } else {
        res.status(401).json({ message: "Unauthorized" });
    }
});

/**
 * @swagger
 * /api/loans:
 *   post:
 *     summary: Submit a loan application
 *     tags: [Customers]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [requested_loan_amount, loan_tenure_months, applicant_full_name, mobile_number, bvn, nin, state_of_residence, average_monthly_income]
 *             properties:
 *               requested_loan_amount:
 *                 type: number
 *               loan_tenure_months:
 *                 type: integer
 *               applicant_full_name:
 *                 type: string
 *               mobile_number:
 *                 type: string
 *               personal_email:
 *                 type: string
 *               bvn:
 *                 type: string
 *               nin:
 *                 type: string
 *               state_of_residence:
 *                 type: string
 *               average_monthly_income:
 *                 type: number
 *               govt_id_url:
 *                 type: string
 *               statement_of_account_url:
 *                 type: string
 *               proof_of_residence_url:
 *                 type: string
 *               selfie_verification_url:
 *                 type: string
 *               references:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     fullName:
 *                       type: string
 *                     phoneNumber:
 *                       type: string
 *                     relationship:
 *                       type: string
 *                     address:
 *                       type: string
 *               signatures:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Loan application submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 loanId:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
// Submit Loan Application
router.post('/loans', async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            // @ts-ignore
            const customerId = req.user.id;
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

            const numericFields = ['average_monthly_income', 'requested_loan_amount', 'loan_tenure_months', 'eligible_amount'];
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
                applying_for_others, relationship_to_applicant, title,
                // Name parts
                surname, first_name, middle_name, is_politically_exposed, gender, date_of_birth, religion, marital_status, mothers_maiden_name, mobile_number, personal_email, bvn, nin,
                // Financials
                state_of_origin, state_of_residence, primary_home_address, residential_status, number_of_dependents, has_active_loans, average_monthly_income,
                // Documents
                govt_id_url, statement_of_account_url, proof_of_residence_url, selfie_verification_url, work_id_url, payslip_url,
                // References
                references, // Should be an array of objects
                // Loan Details
                requested_loan_amount, loan_tenure_months, signatures, mda_tertiary, ippis_number, staff_id, referral_code, eligible_amount, bank_name, account_number, account_name
            } = req.body;

            // Validate Mandatory Fields
            if (!surname || !first_name || !mobile_number || !requested_loan_amount) {
                return res.status(400).json({ message: "Surname, First Name, Mobile, and Amount are required." });
            }

            // Validate Mandatory Documents
            if (!govt_id_url || !work_id_url || !payslip_url) {
                return res.status(400).json({ message: "Govt ID, Work ID, and Payslip are mandatory." });
            }

            // 0. Check for existing active loans with the same BVN
            if (bvn) {
                const activeLoanCheck = await pool.query(
                    "SELECT id FROM loans WHERE bvn = $1 AND status NOT IN ('rejected') LIMIT 1",
                    [bvn]
                );
                if (activeLoanCheck.rows.length > 0) {
                    return res.status(400).json({
                        message: `CUSTOMER EXISTS! A client with this BVN already has an active or pending loan.`
                    });
                }
            }

            // Construct Full Name for Backward Compatibility
            const applicant_full_name = `${surname} ${first_name} ${middle_name || ''}`.trim();

            // Auto-assign Sales Officer
            let assignedOfficerId = null;
            let effectiveReferralCode = referral_code;

            // If no referral code provided in this request, check if the customer used one during signup/marketing
            if (!effectiveReferralCode) {
                const marketingResult = await pool.query('SELECT referral_code FROM marketing WHERE customer_id = $1 ORDER BY id DESC LIMIT 1', [customerId]);
                if (marketingResult.rows[0]?.referral_code) {
                    effectiveReferralCode = marketingResult.rows[0].referral_code;
                    console.log(`[Referral] Found signup referral code for loan customer ${customerId}: ${effectiveReferralCode}`);
                }
            }

            if (effectiveReferralCode) {
                // 1. Try to find officer by referral code
                const referrerResult = await pool.query('SELECT id FROM customers WHERE referral_code = $1', [effectiveReferralCode]);
                const referrer = referrerResult.rows[0];
                if (referrer) {
                    assignedOfficerId = referrer.id;
                }
            }

            if (!assignedOfficerId) {
                // 2. Round Robin / Random assignment to a Sales Officer
                // Fetch all users with role 'sales_officer'
                const officersResult = await pool.query("SELECT id FROM customers WHERE role = 'sales_officer'");
                const officers = officersResult.rows;

                if (officers.length > 0) {
                    // Simple Random Assignment for now (acts as basic load balancing)
                    const randomIndex = Math.floor(Math.random() * officers.length);
                    assignedOfficerId = officers[randomIndex].id;
                } else {
                    // Fallback: Assign to Super Admin or leave null?
                    // Let's try to find a superadmin if no sales officer exists
                    const adminResult = await pool.query("SELECT id FROM customers WHERE role = 'super_admin' OR role = 'superadmin' LIMIT 1");
                    const admin = adminResult.rows[0];
                    if (admin) assignedOfficerId = admin.id;
                }
            }

            const newLoanResult = await pool.query(
                `INSERT INTO loans (
                    customer_id,
                    applying_for_others, relationship_to_applicant,
                    surname, first_name, middle_name, applicant_full_name,
                    title,
                    is_politically_exposed, gender, date_of_birth, religion, marital_status,
                    mothers_maiden_name, mobile_number, personal_email, bvn, nin,
                    state_of_origin, state_of_residence, primary_home_address, residential_status,
                    number_of_dependents, has_active_loans, average_monthly_income,
                    govt_id_url, statement_of_account_url, proof_of_residence_url, selfie_verification_url,
                    work_id_url, payslip_url,
                    customer_references,
                    requested_loan_amount, loan_tenure_months, signatures,
                    mda_tertiary, ippis_number, staff_id, referral_code, eligible_amount,
                    bank_name, account_number, account_name,
                    sales_officer_id,
                    loan_type
                ) VALUES (
                    $1,
                    $2, $3,
                    $4, $5, $6, $7,
                    $8,
                    $9, $10, $11, $12, $13,
                    $14, $15, $16, $17, $18,
                    $19, $20, $21, $22,
                    $23, $24, $25,
                    $26, $27, $28, $29,
                    $30, $31,
                    $32,
                    $33, $34, $35,
                    $36, $37, $38, $39, $40,
                    $41, $42, $43,
                    $44,
                    'new'
                )
                RETURNING *`,
                [
                    customerId,
                    applying_for_others || false, relationship_to_applicant || null,
                    surname, first_name, middle_name || null, applicant_full_name,
                    title || null,
                    is_politically_exposed || false, gender || null, date_of_birth || null, religion || null, marital_status || null,
                    mothers_maiden_name || null, mobile_number || null, personal_email || null, bvn || null, nin || null,
                    state_of_origin || null, state_of_residence || null, primary_home_address || null, residential_status || null,
                    number_of_dependents || 0, has_active_loans || false, average_monthly_income || 0,
                    govt_id_url || null, statement_of_account_url || null, proof_of_residence_url || null, selfie_verification_url || null,
                    work_id_url || null, payslip_url || null,
                    references ? JSON.stringify(references) : null,
                    requested_loan_amount || 0, loan_tenure_months || 0, signatures || null,
                    mda_tertiary || null, ippis_number || null, staff_id || null, effectiveReferralCode || null, eligible_amount || 0,
                    bank_name || null, account_number || null, account_name || null,
                    assignedOfficerId
                ]
            );

            const loan = newLoanResult.rows[0];

            // Send Notification to Sales Officer
            if (assignedOfficerId) {
                try {
                    const officerResult = await pool.query('SELECT email, full_name, role FROM customers WHERE id = $1', [assignedOfficerId]);
                    const officer = officerResult.rows[0];
                    if (officer && officer.email) {
                        // Send notification about new loan in 'sales' stage
                        await resendService.sendStageNotification([officer.email], loan.id, 'sales');
                        console.log(`Notification sent to Sales Officer (${officer.email}) for Loan ${loan.id}`);
                    }
                } catch (emailError) {
                    console.error("Failed to send submission notification:", emailError);
                }
            }

            // Real-time Update
            try {
                const io = getIO();
                io.emit('loan_new', loan);
            } catch (socketError) {
                console.error("Socket emit failed:", socketError);
            }

            res.status(201).json({ message: "Loan application submitted successfully", loanId: loan.id });

        } catch (error: any) {
            console.error("Error submitting loan application:", error);
            res.status(500).json({
                message: "Error submitting loan application. Please check your inputs or try again.",
                details: error.message
            });
        }
    } else {
        res.status(401).json({ message: "Unauthorized" });
    }
});

/**
 * @swagger
 * /api/loans:
 *   get:
 *     summary: Get all loans for the current customer
 *     tags: [Customers]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of loans
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   requested_loan_amount:
 *                     type: number
 *                   status:
 *                     type: string
 *                   created_at:
 *                     type: string
 *       401:
 *         description: Unauthorized
 */
router.get('/loans', async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            // @ts-ignore
            const customerId = req.user.id;
            const loansResult = await pool.query(
                `SELECT * FROM loans 
                WHERE customer_id = $1
                ORDER BY created_at DESC`,
                [customerId]
            );
            res.json(loansResult.rows);
        } catch (error) {
            console.error("Error fetching customer loans:", error);
            res.status(500).json({ message: "Internal Server Error" });
        }
    } else {
        res.status(401).json({ message: "Unauthorized" });
    }
});

export default router;

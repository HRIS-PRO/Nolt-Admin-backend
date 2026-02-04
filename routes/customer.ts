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

import sql from '../config/db.js';

router.put('/onboarding-complete', async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            // @ts-ignore
            const userId = req.user.id;
            await sql`
            UPDATE customers
            SET new_comer = false
            WHERE id = ${userId}
          `;

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

// Check referral code
router.get('/referral/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const [user] = await sql`
            SELECT id, full_name, avatar_url FROM customers WHERE referral_code = ${code}
        `;

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

// Create marketing entry
router.post('/marketing', async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            const { hear_about_us, referral_code, officer_name } = req.body;
            // @ts-ignore
            const customerId = req.user.id;

            await sql`
                INSERT INTO marketing (customer_id, hear_about_us, referral_code, officer_name)
                VALUES (${customerId}, ${hear_about_us}, ${referral_code || null}, ${officer_name || null})
            `;

            res.status(201).json({ message: "Marketing data saved" });
        } catch (error) {
            console.error("Error saving marketing data:", error);
            res.status(500).json({ message: "Internal Server Error" });
        }
    } else {
        res.status(401).json({ message: "Unauthorized" });
    }
});

// Submit Loan Application
router.post('/loans', async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            // @ts-ignore
            const customerId = req.user.id;
            const {
                // Identity
                applying_for_others, relationship_to_applicant, applicant_full_name, title,
                is_politically_exposed, gender, date_of_birth, religion, marital_status,
                mothers_maiden_name, mobile_number, personal_email, bvn, nin,

                // Financials
                state_of_origin, state_of_residence, primary_home_address, residential_status,
                number_of_dependents, has_active_loans, average_monthly_income,

                // Documents
                govt_id_url, statement_of_account_url, proof_of_residence_url, selfie_verification_url,

                // References
                references, // Should be an array of objects

                // Loan Details
                requested_loan_amount, loan_tenure_months, signature_url,
                mda_tertiary, ippis_number, staff_id, referral_code, eligible_amount
            } = req.body;

            const [loan] = await sql`
                INSERT INTO loans (
                    customer_id,
                    applying_for_others, relationship_to_applicant, applicant_full_name, title,
                    is_politically_exposed, gender, date_of_birth, religion, marital_status,
                    mothers_maiden_name, mobile_number, personal_email, bvn, nin,
                    state_of_origin, state_of_residence, primary_home_address, residential_status,
                    number_of_dependents, has_active_loans, average_monthly_income,
                    govt_id_url, statement_of_account_url, proof_of_residence_url, selfie_verification_url,
                    customer_references,
                    requested_loan_amount, loan_tenure_months, signature_url,
                    mda_tertiary, ippis_number, staff_id, referral_code, eligible_amount
                ) VALUES (
                    ${customerId},
                    ${applying_for_others || false}, ${relationship_to_applicant || null}, ${applicant_full_name || null}, ${title || null},
                    ${is_politically_exposed || false}, ${gender || null}, ${date_of_birth || null}, ${religion || null}, ${marital_status || null},
                    ${mothers_maiden_name || null}, ${mobile_number || null}, ${personal_email || null}, ${bvn || null}, ${nin || null},
                    ${state_of_origin || null}, ${state_of_residence || null}, ${primary_home_address || null}, ${residential_status || null},
                    ${number_of_dependents || 0}, ${has_active_loans || false}, ${average_monthly_income || 0},
                    ${govt_id_url || null}, ${statement_of_account_url || null}, ${proof_of_residence_url || null}, ${selfie_verification_url || null},
                    ${references ? sql.json(references) : null},
                    ${requested_loan_amount || 0}, ${loan_tenure_months || 0}, ${signature_url || null},
                    ${mda_tertiary || null}, ${ippis_number || null}, ${staff_id || null}, ${referral_code || null}, ${eligible_amount || 0}
                )
                RETURNING *
            `;

            res.status(201).json({ message: "Loan application submitted successfully", loanId: loan.id });
        } catch (error) {
            console.error("Error submitting loan application:", error);
            res.status(500).json({ message: "Internal Server Error" });
        }
    } else {
        res.status(401).json({ message: "Unauthorized" });
    }
});

export default router;

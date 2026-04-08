
import { Router } from 'express';
import pool from '../config/db.js';
import { kycService } from '../services/kycService.js';
import { paystackService } from '../services/paystackService.js';

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
 * /api/profile/verify-bvn:
 *   post:
 *     summary: Specialized endpoint to perform a BVN lookup and return identity data for auto-filling
 *     tags: [Profile]
 */
router.post('/verify-bvn', isAuthenticated, async (req: any, res) => {
    try {
        const { bvn } = req.body;
        if (!bvn || bvn.length !== 11) {
            return res.status(400).json({ success: false, message: "Invalid BVN. Must be 11 digits." });
        }

        console.log(`[Profile] Specialized BVN Lookup: ${bvn}`);

        // 1. Check uniqueness: ensure no OTHER user has this BVN
        const existingProfile = await pool.query('SELECT user_id FROM user_profiles WHERE bvn = $1 AND user_id != $2', [bvn, req.user.id]);
        if (existingProfile.rows.length > 0) {
            return res.status(400).json({ success: false, message: "PROFILE EXISTS! This BVN is already registered to another account." });
        }



        const bvnData = await kycService.lookupBVN(bvn);

        if (bvnData) {
            res.json({
                success: true,
                data: {
                    first_name: bvnData.firstName,
                    surname: bvnData.lastName,
                    middle_name: bvnData.middleName || '',
                    dob: bvnData.dateOfBirth,
                    phone_number: bvnData.phoneNumber1,
                    gender: bvnData.gender
                }
            });
        } else {
            res.status(404).json({ success: false, message: "BVN not found." });
        }
    } catch (error: any) {
        console.error("[Profile] Specialized BVN Lookup Error:", error);
        res.status(500).json({ success: false, message: error.message || "BVN verification failed" });
    }
});

/**
 * @swagger
 * /api/profile/banks:
 *   get:
 *     summary: Fetch list of supported banks
 *     tags: [Profile]
 */
router.get('/banks', isAuthenticated, async (req: any, res) => {
    try {
        const banksResponse = await paystackService.getBanks();
        if (banksResponse && banksResponse.status) {
            res.json({ success: true, data: banksResponse.data });
        } else {
            res.status(400).json({ success: false, message: "Failed to fetch banks" });
        }
    } catch (error: any) {
        console.error("[Profile] Get Banks Error:", error);
        res.status(500).json({ success: false, message: "Internal server error connecting to bank provider" });
    }
});

/**
 * @swagger
 * /api/profile/verify-bank:
 *   post:
 *     summary: Verify account number against a selected bank and compare with BVN name
 *     tags: [Profile]
 */
router.post('/verify-bank', isAuthenticated, async (req: any, res) => {
    try {
        const { account_number, bank_code, bvn_name, is_corporate } = req.body;
        
        if (!account_number || !bank_code) {
            return res.status(400).json({ success: false, message: "Account number and bank code are required." });
        }

        // 1. Resolve Account Name from Paystack
        let resolvedAccountName = "";
        try {
            const resolveResp = await paystackService.resolveAccountNumber(account_number, bank_code);
            if (resolveResp && resolveResp.status) {
                resolvedAccountName = resolveResp.data.account_name;
            } else {
                return res.status(400).json({ success: false, message: resolveResp?.message || "Failed to resolve account number." });
            }
        } catch (resolveErr: any) {
            console.error("[Profile] Bank Resolve Error:", resolveErr.response?.data || resolveErr.message);
            return res.status(400).json({ success: false, message: resolveErr.response?.data?.message || "Invalid account number or bank code." });
        }

        // 2. Exact or Fuzzy Matching
        if (is_corporate) {
            // If it's corporate, frontend must handle manual verification via bank statement.
            // We just return the resolved name so they can see it.
            return res.json({
                success: true,
                message: "Corporate account requires manual statement verification.",
                data: {
                    account_name: resolvedAccountName,
                    isMatch: false,
                    reason: "corporate"
                }
            });
        }

        // Fuzzy match: split bvn_name and resolvedAccountName into words, check intersection
        const normalize = (str: string) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
        const bvnWords = normalize(bvn_name);
        const accWords = normalize(resolvedAccountName);

        // Check how many words intersect
        const intersection = bvnWords.filter(word => accWords.includes(word));
        
        // We require at least 2 matching words (e.g., First and Last name matches)
        // OR if the BVN only has 2 words, both must match (wait, let's just say >= 2 words match)
        let isMatch = false;
        
        // If the user's name somehow only has 1 valid word, then 1 match is fine.
        const requiredMatches = Math.min(2, bvnWords.length);
        if (intersection.length >= requiredMatches && requiredMatches > 0) {
            isMatch = true;
        }

        return res.json({
            success: true,
            data: {
                account_name: resolvedAccountName,
                isMatch,
                reason: isMatch ? "fuzzy_match_passed" : "mismatch",
                matchedWords: intersection.length
            }
        });

    } catch (error: any) {
        console.error("[Profile] Verify Bank Error:", error);
        res.status(500).json({ success: false, message: "Internal server error verifying bank account" });
    }
});

/**
 * @swagger
 * /api/profile:
 *   get:
 *     summary: Fetch user profile
 *     tags: [Profile]
 */
router.get('/', isAuthenticated, async (req: any, res) => {
    try {
        const userId = req.user.id;
        const email = req.user.email;

        // 1. Try to get existing profile
        const profileResult = await pool.query(
            'SELECT * FROM user_profiles WHERE user_id = $1',
            [userId]
        );

        if (profileResult.rows.length > 0) {
            return res.json({ success: true, profile: profileResult.rows[0], source: 'profile' });
        }

        // 2. If no profile, try to pre-fill from customers table
        const customerResult = await pool.query(
            'SELECT * FROM customers WHERE email = $1 LIMIT 1',
            [email]
        );

        if (customerResult.rows.length > 0) {
            const c = customerResult.rows[0];
            // Map legacy customer fields to profile fields
            const draftProfile = {
                first_name: c.first_name || '',
                surname: c.surname || '',
                middle_name: c.middle_name || '',
                phone_number: c.mobile_number || '',
                personal_email: c.personal_email || email,
                state_of_origin: c.state_of_origin || '',
                state_of_residence: c.state_of_residence || '',
                address: c.primary_home_address || '',
                bvn: c.bvn || '',
                nin: c.nin || '',
                date_of_birth: c.date_of_birth || null,
                is_identity_verified: false // Must re-verify on new profile
            };
            return res.json({ success: true, profile: draftProfile, source: 'customer_draft' });
        }

        // 3. Return empty profile
        return res.json({ success: true, profile: null, source: 'none' });

    } catch (error) {
        console.error("GET Profile Error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

/**
 * @swagger
 * /api/profile:
 *   put:
 *     summary: Create or Update user profile
 *     tags: [Profile]
 */
router.put('/', isAuthenticated, async (req: any, res) => {
    try {
        const userId = req.user.id;
        const {
            first_name, surname, middle_name, phone_number, personal_email,
            state_of_origin, state_of_residence, address, bvn, nin, date_of_birth,
            bank_name, bank_code, account_number, account_name, bank_statement_url, is_corporate_account, bank_verified
        } = req.body;

        // 1. Validate mandatory fields (including bank details for completion)
        if (!first_name || !surname || !phone_number || !personal_email || !date_of_birth ||
            !state_of_origin || !state_of_residence || !address || !bank_name || !account_number) {
            return res.status(400).json({ success: false, message: "Missing required profile fields (Residential and Bank details are mandatory)" });
        }

        // 2. Identity Verification Logic (Trigger if BVN is provided and not already verified)
        let isIdentityVerified = false;
        let verificationRef = null;

        if (bvn && bvn.length === 11) {
            console.log(`[Profile Update] Verifying Identity for BVN: ${bvn}`);

            // 2.1 Check uniqueness: ensure no OTHER user has this BVN
            const existingProfile = await pool.query('SELECT user_id FROM user_profiles WHERE bvn = $1 AND user_id != $2', [bvn, userId]);
            if (existingProfile.rows.length > 0) {
                return res.status(400).json({ success: false, message: "PROFILE EXISTS! This BVN is already registered to another account." });
            }



            try {
                const bvnData = await kycService.lookupBVN(bvn);
                if (bvnData) {
                    const validation = kycService.validateBVNMatch(
                        { firstName: first_name, surname: surname, dob: date_of_birth, mobileNumber: phone_number },
                        bvnData
                    );

                    if (validation.isValid) {
                        isIdentityVerified = true;
                        verificationRef = `PROFILE_VER_OK_${Date.now()}`;
                        console.log("[Profile Update] Identity Verified successfully.");
                    } else {
                        return res.status(400).json({
                            success: false,
                            message: `Identity Verification Failed: ${validation.details}`,
                            matches: validation.matches
                        });
                    }
                } else {
                    return res.status(400).json({ success: false, message: "Identity Verification Failed: BVN not found." });
                }
            } catch (kycError: any) {
                console.error("[Profile Update] KYC Error:", kycError);
                return res.status(500).json({ success: false, message: kycError.message || "KYC lookup failed" });
            }
        }

        // 3. Upsert Profile
        const query = `
            INSERT INTO user_profiles (
                user_id, first_name, surname, middle_name, phone_number, personal_email,
                state_of_origin, state_of_residence, address, bvn, nin, date_of_birth,
                is_identity_verified, verification_ref, updated_at,
                bank_name, bank_code, account_number, account_name, bank_statement_url, is_corporate_account, bank_verified
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15, $16, $17, $18, $19, $20, $21)
            ON CONFLICT (user_id) DO UPDATE SET
                first_name = EXCLUDED.first_name,
                surname = EXCLUDED.surname,
                middle_name = EXCLUDED.middle_name,
                phone_number = EXCLUDED.phone_number,
                personal_email = EXCLUDED.personal_email,
                state_of_origin = EXCLUDED.state_of_origin,
                state_of_residence = EXCLUDED.state_of_residence,
                address = EXCLUDED.address,
                bvn = EXCLUDED.bvn,
                nin = EXCLUDED.nin,
                date_of_birth = EXCLUDED.date_of_birth,
                is_identity_verified = EXCLUDED.is_identity_verified,
                verification_ref = EXCLUDED.verification_ref,
                updated_at = NOW(),
                bank_name = COALESCE(user_profiles.bank_name, EXCLUDED.bank_name),
                bank_code = COALESCE(user_profiles.bank_code, EXCLUDED.bank_code),
                account_number = COALESCE(user_profiles.account_number, EXCLUDED.account_number),
                account_name = COALESCE(user_profiles.account_name, EXCLUDED.account_name),
                bank_statement_url = COALESCE(user_profiles.bank_statement_url, EXCLUDED.bank_statement_url),
                is_corporate_account = COALESCE(user_profiles.is_corporate_account, EXCLUDED.is_corporate_account),
                bank_verified = EXCLUDED.bank_verified
            RETURNING *;
        `;

        const values = [
            userId, first_name, surname, middle_name, phone_number, personal_email,
            state_of_origin, state_of_residence, address, bvn, nin, date_of_birth,
            isIdentityVerified, verificationRef,
            bank_name, bank_code, account_number, account_name, bank_statement_url, is_corporate_account || false, bank_verified || false
        ];

        const result = await pool.query(query, values);

        res.json({
            success: true,
            message: "Profile updated successfully",
            profile: result.rows[0]
        });

    } catch (error) {
        console.error("PUT Profile Error:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

export default router;

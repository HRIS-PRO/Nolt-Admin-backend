
import { Router } from 'express';
import pool from '../config/db.js';
import { kycService } from '../services/kycService.js';

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
            return res.status(400).json({ success: false, message: "CUSTOMER EXISTS! This BVN is already registered to another account." });
        }
        
        const existingCustomer = await pool.query('SELECT id FROM customers WHERE bvn = $1 AND id != $2', [bvn, req.user.id]);
        if (existingCustomer.rows.length > 0) {
            return res.status(400).json({ success: false, message: "CUSTOMER EXISTS! This BVN is already registered to another account." });
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
            state_of_origin, state_of_residence, address, bvn, nin, date_of_birth
        } = req.body;

        // 1. Validate mandatory fields
        if (!first_name || !surname || !phone_number || !personal_email || !date_of_birth || 
            !state_of_origin || !state_of_residence || !address) {
            return res.status(400).json({ success: false, message: "Missing required profile fields (Residential details are mandatory)" });
        }

        // 2. Identity Verification Logic (Trigger if BVN is provided and not already verified)
        let isIdentityVerified = false;
        let verificationRef = null;

        if (bvn && bvn.length === 11) {
            console.log(`[Profile Update] Verifying Identity for BVN: ${bvn}`);
            
            // 2.1 Check uniqueness: ensure no OTHER user has this BVN
            const existingProfile = await pool.query('SELECT user_id FROM user_profiles WHERE bvn = $1 AND user_id != $2', [bvn, userId]);
            if (existingProfile.rows.length > 0) {
                return res.status(400).json({ success: false, message: "CUSTOMER EXISTS! This BVN is already registered to another account." });
            }
            
            const existingCustomer = await pool.query('SELECT id FROM customers WHERE bvn = $1 AND id != $2', [bvn, userId]);
            if (existingCustomer.rows.length > 0) {
                return res.status(400).json({ success: false, message: "CUSTOMER EXISTS! This BVN is already registered to another account." });
            }

            try {
                const bvnData = await kycService.lookupBVN(bvn);
                if (bvnData) {
                    const validation = kycService.validateBVNMatch(
                        { firstName: first_name, dob: date_of_birth, mobileNumber: phone_number },
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
                is_identity_verified, verification_ref, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
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
                updated_at = NOW()
            RETURNING *;
        `;

        const values = [
            userId, first_name, surname, middle_name, phone_number, personal_email,
            state_of_origin, state_of_residence, address, bvn, nin, date_of_birth,
            isIdentityVerified, verificationRef
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

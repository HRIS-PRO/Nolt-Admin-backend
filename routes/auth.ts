import { Router } from 'express';
import passport from 'passport';
import bcrypt from 'bcrypt';
import pool from '../config/db.js';
import { resendService } from '../services/resendService.js';

const router = Router();

// Routes start with /auth

/**
 * @swagger
 * /auth/google:
 *   get:
 *     summary: Initiate Google OAuth login
 *     tags: [Auth]
 *     description: Redirects the user to Google's sign-in page.
 *     responses:
 *       302:
 *         description: Redirect to Google
 */
router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

/**
 * @swagger
 * /auth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     tags: [Auth]
 *     description: Handles the callback from Google, creates a session, and redirects to the frontend.
 *     responses:
 *       302:
 *         description: Redirect to dashboard on success or home on failure
 */
router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
        // Successful authentication, redirect to frontend
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

        // Explicitly save session before redirect to ensure cookie is set
        req.session.save((err) => {
            if (err) {
                console.error("Session save error during callback:", err);
                return res.redirect(`${frontendUrl}/login?error=session_save_failed`);
            }
            console.log(`[Google Callback] Session Saved. ID: ${req.sessionID}. Redirecting to ${frontendUrl}/dashboard`);
            // console.log('[Google Callback] Cookie Settings:', req.session.cookie);
            // console.log('[Google Callback] Set-Cookie Header:', res.getHeaders()['set-cookie']);
            res.redirect(`${frontendUrl}/dashboard?login=success`);
        });
    }
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login with Email/Password (Customer/Staff)
 *     tags: [Auth]
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
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', async (req, res, next) => {
    // Custom Local Strategy Authentication to handle OTP flow
    passport.authenticate('local', async (err: any, user: any, info: any) => {
        if (err) { return next(err); }
        if (!user) { return res.status(401).json(info); }

        try {
            // Generate OTP
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

            // Save OTP to DB
            await pool.query(
                'UPDATE customers SET email_otp = $1, email_otp_expires_at = $2 WHERE id = $3',
                [otp, expiresAt, user.id]
            );

            // Send OTP via Email
            await resendService.sendEmailToken(user.email, otp);

            return res.json({
                message: "OTP sent to email",
                email: user.email,
                requireOtp: true
            });

        } catch (error) {
            console.error("Login OTP Error:", error);
            return res.status(500).json({ message: "Failed to send OTP" });
        }
    })(req, res, next);
});

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new customer
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, full_name]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               full_name:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: User already exists
 */
router.post('/register', async (req, res) => {
    try {
        const { email, password, full_name } = req.body;

        if (!email || !password || !full_name) {
            return res.status(400).json({ message: "Email, password, and full name are required" });
        }

        // Check if user exists
        const existingUsers = await pool.query('SELECT id FROM customers WHERE email = $1', [email]);
        if (existingUsers.rows.length > 0) {
            return res.status(400).json({ message: "User already exists" });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const newUserResult = await pool.query(
            `INSERT INTO customers (email, password_hash, full_name, role, new_comer, is_active)
             VALUES ($1, $2, $3, 'customer', true, true)
             RETURNING *`,
            [email, passwordHash, full_name]
        );

        const user = newUserResult.rows[0];

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        // Save OTP (Update the just created user)
        await pool.query(
            'UPDATE customers SET email_otp = $1, email_otp_expires_at = $2 WHERE id = $3',
            [otp, expiresAt, user.id]
        );

        // Send OTP
        await resendService.sendEmailToken(email, otp);

        res.status(201).json({
            message: "Registration successful. OTP sent to email.",
            email: user.email,
            requireOtp: true
        });

    } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /auth/verify-email-otp:
 *   post:
 *     summary: Verify Email OTP and Login
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp]
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Invalid or expired OTP
 */
router.post('/verify-email-otp', async (req, res, next) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: "Email and OTP are required" });
        }

        // Debug Log
        console.log(`Verifying OTP for ${email}. Input OTP: ${otp}`);

        // Find user with matching OTP and valid expiry
        const usersResult = await pool.query(
            `SELECT * FROM customers 
             WHERE email = $1 
             AND email_otp = $2 
             AND email_otp_expires_at > NOW()`,
            [email, otp]
        );

        if (usersResult.rows.length === 0) {
            console.log(`OTP Verification Failed for ${email}. No matching user found (or expired).`);
            return res.status(400).json({ message: "Invalid or expired OTP" });
        }

        const user = usersResult.rows[0];

        // Clear OTP
        await pool.query(
            'UPDATE customers SET email_otp = NULL, email_otp_expires_at = NULL WHERE id = $1',
            [user.id]
        );

        // Log user in using Passport
        req.logIn(user, (err) => {
            if (err) { return next(err); }

            // Explicitly save session to ensure cookie is set
            req.session.save((err) => {
                if (err) { return next(err); }
                console.log(`OTP Login Successful for ${email}. Session ID: ${req.sessionID}`);
                return res.json({ message: "Login successful", user });
            });
        });

    } catch (error) {
        console.error("OTP Verification Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

/**
 * @swagger
 * /auth/logout:
 *   get:
 *     summary: Logout user
 *     tags: [Auth]
 *     description: Destroys the session and logs the user out.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       302:
 *         description: Redirect to home page
 */
router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('http://localhost:3000');
    });
});

export default router;

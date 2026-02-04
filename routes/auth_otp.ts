import { Router } from 'express';
// @ts-ignore
import * as otplib from 'otplib';
const authenticator = (otplib as any).authenticator || (otplib as any).default?.authenticator;
import qrcode from 'qrcode';
import sql from '../config/db.js';

const router = Router();

// Middleware to ensure user is logged in
const isAuthenticated = (req: any, res: any, next: any) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: "Unauthorized. Please login first." });
};

/**
 * @swagger
 * /auth/otp/generate:
 *   post:
 *     summary: Generate OTP secret and QR code for staff
 *     tags: [Auth]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: QR code and secret generated
 */
router.post('/generate', isAuthenticated, async (req, res) => {
    // Cast user to any to avoid TypeScript errors with custom properties
    const user = req.user as any;

    // Only staff roles (not customers) need OTP
    if (user.role === 'customer') {
        return res.status(400).json({ message: "Customers do not need OTP." });
    }

    try {
        const secret = authenticator.generateSecret();
        const otpauth = authenticator.keyuri(user.email || 'User', 'Nolt Admin', secret);

        await sql`
            UPDATE customers 
            SET otp_secret = ${secret}
            WHERE id = ${user.id}
`;

        qrcode.toDataURL(otpauth, (err: any, imageUrl: any) => {
            if (err) {
                console.error("Error generating QR", err);
                return res.status(500).json({ message: "Error generating QR code" });
            }
            res.json({
                message: "OTP Secret generated. Scan this QR code.",
                image_url: imageUrl,
                secret: secret
            });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error generating OTP secret." });
    }
});

/**
 * @swagger
 * /auth/otp/verify:
 *   post:
 *     summary: Verify OTP code
 *     tags: [Auth]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *       400:
 *         description: Invalid OTP
 */
router.post('/verify', isAuthenticated, async (req, res) => {
    const { token } = req.body;
    const user = req.user as any;

    if (!user.otp_secret) {
        return res.status(400).json({ message: "OTP not set up for this user." });
    }

    try {
        const isValid = authenticator.check(token, user.otp_secret);

        if (isValid) {
            if (req.session) {
                req.session.otp_verified = true;
            }
            res.json({ message: "OTP Verified successfully." });
        } else {
            res.status(400).json({ message: "Invalid OTP code." });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error verifying OTP." });
    }
});

export default router;

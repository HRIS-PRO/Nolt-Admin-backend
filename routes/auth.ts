import { Router } from 'express';
import passport from 'passport';

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
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}/dashboard?login=success`);
    }
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login with Email/Password (Staff)
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
router.post('/login', (req, res, next) => {
    passport.authenticate('local', (err: any, user: any, info: any) => {
        if (err) { return next(err); }
        if (!user) { return res.status(401).json(info); }

        req.logIn(user, (err) => {
            if (err) { return next(err); }
            return res.json({ message: "Login successful", user });
        });
    })(req, res, next);
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
        // res.redirect('http://localhost:3000'); // Triggers CORS error on fetch
        res.status(200).json({ message: "Logged out successfully" });
    });
});

export default router;

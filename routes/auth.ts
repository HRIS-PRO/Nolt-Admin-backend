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
        res.redirect('http://localhost:3000/dashboard?login=success');
    }
);

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

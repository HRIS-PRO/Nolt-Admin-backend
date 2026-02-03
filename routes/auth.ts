import { Router } from 'express';
import passport from 'passport';

const router = Router();

// Routes start with /auth

router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
        // Successful authentication, redirect to frontend
        res.redirect('http://localhost:3000/dashboard?login=success');
    }
);

router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('http://localhost:3000');
    });
});

export default router;

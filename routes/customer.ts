import { Router } from 'express';

const router = Router();

// Routes start with /api

router.get('/me', (req, res) => {
    if (req.isAuthenticated()) {
        res.json(req.user);
    } else {
        res.status(401).json({ message: "Unauthorized" });
    }
});

export default router;

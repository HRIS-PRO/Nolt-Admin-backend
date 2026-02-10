
import express from 'express';
import axios from 'axios';

const router = express.Router();

// GET /api/misc/banks - Fetch banks from Paystack
router.get('/banks', async (req, res) => {
    try {
        // Try fetching without key first as user suggested, or use public key if available
        // Paystack usually requires a key. User claimed otherwise.
        // We will try without headers first.
        const response = await axios.get('https://api.paystack.co/bank');
        res.json(response.data);
    } catch (error: any) {
        console.error("Error fetching banks:", error.response?.data || error.message);
        // Fallback or error
        res.status(500).json({ message: "Failed to fetch banks", error: error.message });
    }
});

export default router;

import axios from 'axios';
import 'dotenv/config';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

export const paystackService = {
    /**
     * Initialize a transaction
     */
    async initializeTransaction(email: string, amount_in_naira: number, metadata: any = {}) {
        if (!PAYSTACK_SECRET) throw new Error("Paystack Secret Key not configured");

        const response = await axios.post(
            `${PAYSTACK_BASE_URL}/transaction/initialize`,
            {
                email,
                amount: Math.round(amount_in_naira * 100), // Convert to Kobo
                metadata,
                callback_url: `${process.env.FRONTEND_URL}/investment/verify-payment`
            },
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data;
    },

    /**
     * Verify a transaction via its reference
     */
    async verifyTransaction(reference: string) {
        if (!PAYSTACK_SECRET) throw new Error("Paystack Secret Key not configured");

        const response = await axios.get(
            `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET}`
                }
            }
        );

        return response.data;
    },

    /**
     * Get list of banks
     */
    async getBanks() {
        if (!PAYSTACK_SECRET) throw new Error("Paystack Secret Key not configured");

        const response = await axios.get(
            `${PAYSTACK_BASE_URL}/bank?country=nigeria`,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET}`
                }
            }
        );

        return response.data;
    },

    /**
     * Resolve Account Number
     */
    async resolveAccountNumber(account_number: string, bank_code: string) {
        if (!PAYSTACK_SECRET) throw new Error("Paystack Secret Key not configured");

        const response = await axios.get(
            `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET}`
                }
            }
        );

        return response.data;
    }
};

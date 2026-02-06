import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const TERMII_BASE_URL = process.env.TERMII_BASE_URL || 'https://api.ng.termii.com';
const TERMII_API_KEY = process.env.TERMII_API_KEY;
const TERMII_EMAIL_CONFIG_ID = process.env.TERMII_EMAIL_CONFIG_ID;

interface SendEmailTokenResponse {
    message_id?: string;
    message?: string;
    balance?: number;
    user?: string;
    [key: string]: any;
}

export const termiiService = {
    /**
     * Sends an OTP email using Termii Email Token API
     * @param emailAddress The recipient's email address
     * @param otpCode The OTP code to send (mapped to 'code' in the payload)
     */
    sendEmailToken: async (
        emailAddress: string,
        otpCode: string
    ): Promise<SendEmailTokenResponse> => {

        if (!TERMII_API_KEY || !TERMII_EMAIL_CONFIG_ID) {
            throw new Error("Missing Termii configuration (API Key or Config ID)");
        }

        // Based on Termii API Error feedback, it only accepts these 4 fields.
        // The message/template is likely defined by the email_configuration_id.
        const payload = {
            api_key: TERMII_API_KEY,
            email_address: emailAddress,
            email_configuration_id: TERMII_EMAIL_CONFIG_ID,
            code: otpCode
        };

        try {
            const response = await axios.post(`${TERMII_BASE_URL}/api/email/otp/send`, payload);
            return response.data;
        } catch (error: any) {
            console.error("Termii Email Send Error:", error.response?.data || error.message);
            throw new Error(error.response?.data?.message || "Failed to send email token via Termii");
        }
    }
};
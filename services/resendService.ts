import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

// Trim the API key to remove potential whitespace issues
const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

if (!RESEND_API_KEY) {
    console.warn("WARNING: RESEND_API_KEY is not set. Email sending will fail.");
}

const resend = new Resend(RESEND_API_KEY);

interface SendEmailTokenResponse {
    id?: string;
    error?: any;
    [key: string]: any;
}

export const resendService = {
    /**
     * Sends an OTP email using Resend
     * @param emailAddress The recipient's email address
     * @param otpCode The OTP code to send
     */
    sendEmailToken: async (
        emailAddress: string,
        otpCode: string
    ): Promise<SendEmailTokenResponse> => {

        if (!RESEND_API_KEY) {
            throw new Error("Missing Resend API Key");
        }

        try {
            const { data, error } = await resend.emails.send({
                from: RESEND_FROM_EMAIL,
                to: [emailAddress],
                subject: 'Your Verification Code - Nolt Finance',
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>Verify your email</h2>
                        <p>Your verification code is:</p>
                        <h1 style="background-color: #f4f4f5; padding: 12px; border-radius: 8px; text-align: center; letter-spacing: 5px;">${otpCode}</h1>
                        <p>This code will expire in 15 minutes.</p>
                        <p>If you didn't request this, please ignore this email.</p>
                    </div>
                `
            });

            if (error) {
                console.error("Resend Email Error:", error);
                throw new Error(error.message);
            }

            return data || { id: 'mock-id' };
        } catch (error: any) {
            console.error("Resend Service Error:", error);
            throw new Error(error.message || "Failed to send email via Resend");
        }
    },

    /**
     * Sends a welcome email with credentials to a new user
     * @param emailAddress The recipient's email address
     * @param name The recipient's name
     * @param password The temporary password
     */
    sendWelcomeEmail: async (
        emailAddress: string,
        name: string,
        password: string
    ): Promise<SendEmailTokenResponse> => {

        if (!RESEND_API_KEY) {
            throw new Error("Missing Resend API Key");
        }

        try {
            const { data, error } = await resend.emails.send({
                from: RESEND_FROM_EMAIL,
                to: [emailAddress],
                subject: 'Welcome to Nolt Finance - Your Account Credentials',
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>Welcome to Nolt Finance, ${name}!</h2>
                        <p>An account has been created for you. Here are your login credentials:</p>
                        
                        <div style="background-color: #f4f4f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 0; font-weight: bold;">Email:</p>
                            <p style="margin: 5px 0 15px 0;">${emailAddress}</p>
                            
                            <p style="margin: 0; font-weight: bold;">Temporary Password:</p>
                            <p style="margin: 5px 0 0 0; font-family: monospace; font-size: 18px; color: #000;">${password}</p>
                        </div>

                        <p>Please login and change your password immediately.</p>
                        
                        <a href="https://nolt-finance.vercel.app/login" style="display: inline-block; background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 10px;">Login to Dashboard</a>
                    </div>
                `
            });

            if (error) {
                console.error("Resend Welcome Email Error:", error);
                throw new Error(error.message);
            }

            return data || { id: 'mock-id' };
        } catch (error: any) {
            console.error("Resend Service Error (Welcome Email):", error);
            throw new Error(error.message || "Failed to send welcome email via Resend");
        }
    }
};

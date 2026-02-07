
import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export const resendService = {
    /**
     * Sends an OTP/Token email using Resend
     * @param emailAddress The recipient's email address
     * @param token The OTP code or token to send
     */
    sendEmailToken: async (
        emailAddress: string,
        token: string
    ): Promise<any> => {

        if (!resend) {
            console.warn("Resend API Key missing. Skipping email send.");
            // throwing error so the caller knows it failed, similar to termii
            throw new Error("Missing Resend configuration (API Key)");
        }

        try {
            const { data, error } = await resend.emails.send({
                from: 'Nolt Admin <team@push.noltfinance.com>',
                to: [emailAddress],
                subject: 'Your Verification Code',
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>Verify your account</h2>
                        <p>Your verification code is:</p>
                        <h1 style="font-size: 32px; letter-spacing: 5px; background: #f4f4f4; padding: 20px; text-align: center; border-radius: 8px;">${token}</h1>
                        <p>This code will expire in 15 minutes.</p>
                        <p>If you didn't request this, please ignore this email.</p>
                    </div>
                `,
            });

            if (error) {
                console.error("Resend API Error:", error);
                throw new Error("Failed to send email via Resend: " + error.message);
            }

            console.log("Resend Email Sent Successfully:", data);
            return { message: "Email sent successfully", data };
        } catch (error: any) {
            console.error("Resend Service Error:", error.message);
            throw error;
        }
    }
};

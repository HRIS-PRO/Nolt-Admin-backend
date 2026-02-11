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
                        
                        <a href="https://lms.noltfinance.com/login" style="display: inline-block; background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 10px;">Login to Dashboard</a>
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
    },

    /**
     * Sends a notification to staff members about a loan stage update
     * @param emails Array of staff email addresses
     * @param loanId The ID of the loan application
     * @param stageName The name of the new stage
     */
    sendStageNotification: async (
        emails: string[],
        loanId: string,
        stageName: string
    ): Promise<SendEmailTokenResponse> => {

        if (!RESEND_API_KEY) {
            console.warn("Missing Resend API Key, skipping notification email.");
            return { id: 'skipped-no-key' };
        }

        if (emails.length === 0) {
            return { id: 'skipped-no-recipients' };
        }

        try {
            // Send individually or as bcc? Resend supports multiple 'to'.
            // Let's send one email to all for simplicity, or loop if privacy needed.
            // Staff emails are internal, so shared 'to' is fine, or better 'bcc'.
            // Actually, let's use 'bcc' to avoid reply-all storms or privacy issues.
            // But Resend 'to' array is visible to all.
            // Let's loop for now to be safe and personalized if needed, or just blast to 'to'.
            // For internal staff, 'to' is acceptable.

            // Map technical stage names to professional, less spam-triggering display names
            const getFriendlyStageName = (stage: string) => {
                switch (stage) {
                    case 'sales': return 'Sales Review';
                    case 'customer_experience': return 'Customer Experience Review';
                    case 'credit_check_1': return 'Credit Officer Assessment';
                    case 'credit_check_2': return 'Credit Manager Authorization';
                    case 'internal_audit': return 'Internal Audit';
                    case 'finance': return 'Disbursement Processing';
                    case 'disbursed': return 'Disbursed';
                    default: return stage.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                }
            };

            const friendlyStageName = getFriendlyStageName(stageName);
            const dashboardUrl = process.env.FRONTEND_URL || 'https://nolt-finance.vercel.app';
            const loanUrl = `${dashboardUrl}/staff/loans/${loanId}`;

            const { data, error } = await resend.emails.send({
                from: RESEND_FROM_EMAIL,
                to: emails,
                subject: `Update: Application ${loanId} - ${friendlyStageName}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Loan Application Update</title>
                        <style>
                            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5; }
                            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; margin-top: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                            .header { background-color: #0f172a; padding: 24px; text-align: center; }
                            .header h1 { color: #ffffff; margin: 0; font-size: 20px; letter-spacing: 1px; }
                            .content { padding: 32px; color: #334155; line-height: 1.6; }
                            .info-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 24px 0; }
                            .label { font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 4px; }
                            .value { font-size: 16px; color: #0f172a; font-weight: 600; margin-bottom: 12px; }
                            .value:last-child { margin-bottom: 0; }
                            .button { display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 8px; }
                            .footer { background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>NOLT FINANCE</h1>
                            </div>
                            <div class="content">
                                <h2 style="margin-top: 0; color: #0f172a;">Application Status Update</h2>
                                <p>The status of the following loan application has changed and requires your review.</p>
                                
                                <div class="info-box">
                                    <div class="label">Loan Application ID</div>
                                    <div class="value">${loanId}</div>
                                    <div class="label">New Stage</div>
                                    <div class="value" style="color: #2563eb;">${friendlyStageName}</div>
                                </div>

                                <div style="text-align: center;">
                                    <a href="${loanUrl}" style="color: #ffffff;" class="button">Access Application</a>
                                </div>
                            </div>
                            <div class="footer">
                                &copy; ${new Date().getFullYear()} Nolt Finance. Internal System Notification.
                            </div>
                        </div>
                    </body>
                    </html>
                `
            });

            if (error) {
                console.error("Resend Notification Email Error:", error);
                // Don't throw, just log, as this is a background notification
                return { error };
            }

            return data || { id: 'mock-id' };
        } catch (error: any) {
            console.error("Resend Service Error (Notification):", error);
            // Don't throw
            return { error: error.message };
        }
    }
};

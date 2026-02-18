import { SendMailClient } from "zeptomail";
import dotenv from 'dotenv';

dotenv.config();

const ZEPTO_URL = process.env.ZEPTO_URL || "api.zeptomail.com/";
const ZEPTO_TOKEN = process.env.ZEPTO_TOKEN;
const ZEPTO_FROM_EMAIL = process.env.ZEPTO_FROM_EMAIL || "noreply@noltfinance.com";
const ZEPTO_FROM_NAME = process.env.ZEPTO_FROM_NAME || "Nolt Finance";

if (!ZEPTO_TOKEN) {
    console.warn("WARNING: ZEPTO_TOKEN is not set. Email sending will fail.");
}

const client = new SendMailClient({ url: ZEPTO_URL, token: ZEPTO_TOKEN || "" });

interface SendEmailTokenResponse {
    id?: string;
    error?: any;
    [key: string]: any;
}

export const zeptoService = {
    /**
     * Sends an OTP email using ZeptoMail
     */
    sendEmailToken: async (
        emailAddress: string,
        otpCode: string
    ): Promise<SendEmailTokenResponse> => {
        if (!ZEPTO_TOKEN) throw new Error("Missing Zepto API Key");

        try {
            const resp = await client.sendMail({
                from: {
                    address: ZEPTO_FROM_EMAIL,
                    name: ZEPTO_FROM_NAME
                },
                to: [
                    {
                        email_address: {
                            address: emailAddress,
                            name: "User"
                        }
                    }
                ],
                subject: "Your Verification Code - Nolt Finance",
                htmlbody: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>Verify your email</h2>
                        <p>Your verification code is:</p>
                        <h1 style="background-color: #f4f4f5; padding: 12px; border-radius: 8px; text-align: center; letter-spacing: 5px;">${otpCode}</h1>
                        <p>This code will expire in 15 minutes.</p>
                        <p>If you didn't request this, please ignore this email.</p>
                    </div>
                `
            });
            return { id: 'zepto-sent', ...resp };
        } catch (error: any) {
            console.error("Zepto Service Error:", error);
            throw new Error(error.message || "Failed to send email via Zepto");
        }
    },

    /**
     * Sends a welcome email with credentials
     */
    sendWelcomeEmail: async (
        emailAddress: string,
        name: string,
        password: string
    ): Promise<SendEmailTokenResponse> => {
        if (!ZEPTO_TOKEN) throw new Error("Missing Zepto API Key");

        try {
            const resp = await client.sendMail({
                from: {
                    address: ZEPTO_FROM_EMAIL,
                    name: ZEPTO_FROM_NAME
                },
                to: [
                    {
                        email_address: {
                            address: emailAddress,
                            name: name
                        }
                    }
                ],
                subject: "Welcome to Nolt Finance - Your Account Credentials",
                htmlbody: `
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
            return { id: 'zepto-sent', ...resp };
        } catch (error: any) {
            console.error("Zepto Service Error (Welcome):", error);
            throw new Error(error.message || "Failed to send welcome email via Zepto");
        }
    },

    /**
     * Sends a notification to staff members
     */
    sendStageNotification: async (
        emails: string[],
        loanId: string,
        stageName: string
    ): Promise<SendEmailTokenResponse> => {
        if (!ZEPTO_TOKEN) {
            console.warn("Missing Zepto API Key, skipping notification.");
            return { id: 'skipped-no-key' };
        }
        if (emails.length === 0) return { id: 'skipped-no-recipients' };

        try {
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

            // Zepto expects array of objects for 'to'
            const toRecipients = emails.map(email => ({
                email_address: { address: email, name: "Staff Member" }
            }));

            const resp = await client.sendMail({
                from: {
                    address: ZEPTO_FROM_EMAIL,
                    name: ZEPTO_FROM_NAME
                },
                to: toRecipients,
                subject: `Update: Application ${loanId} - ${friendlyStageName}`,
                htmlbody: `
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
            return { id: 'zepto-sent', ...resp };
        } catch (error: any) {
            console.error("Zepto Service Error (Notification):", error);
            return { error: error.message };
        }
    },

    /**
     * Sends a daily digest of loans pending finance approval.
     */
    sendBulkFinanceDigest: async (
        emails: string[],
        loans: any[]
    ): Promise<SendEmailTokenResponse> => {
        if (!ZEPTO_TOKEN) {
            console.warn("Missing Zepto API Key, skipping finance digest.");
            return { id: 'skipped-no-key' };
        }
        if (emails.length === 0 || loans.length === 0) return { id: 'skipped-no-recipients-or-loans' };

        try {
            const dashboardUrl = process.env.FRONTEND_URL || 'https://nolt-finance.vercel.app';
            const financeQueueUrl = `${dashboardUrl}/staff/loans?stage=finance`;

            const loanRows = loans.map(loan => `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px;">${loan.id}</td>
                    <td style="padding: 12px;">${loan.applicant_full_name}</td>
                    <td style="padding: 12px;">${loan.amount_formatted || loan.requested_loan_amount}</td>
                </tr>
            `).join('');

            const toRecipients = emails.map(email => ({
                email_address: { address: email, name: "Finance Team" }
            }));

            const resp = await client.sendMail({
                from: {
                    address: ZEPTO_FROM_EMAIL,
                    name: ZEPTO_FROM_NAME
                },
                to: toRecipients,
                subject: `Daily Finance Digest: ${loans.length} Loans Pending Approval`,
                htmlbody: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <style>
                            body { font-family: sans-serif; background-color: #f4f4f5; padding: 20px; }
                            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 24px; }
                            h2 { color: #0f172a; }
                            table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
                            th { text-align: left; background-color: #f8fafc; padding: 12px; border-bottom: 2px solid #e2e8f0; }
                            .button { display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>Finance Approval Pending</h2>
                            <p>There are <strong>${loans.length}</strong> loan applications currently waiting in the Finance stage.</p>
                            
                            <table>
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Applicant</th>
                                        <th>Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${loanRows}
                                </tbody>
                            </table>

                            <div style="text-align: center; margin-top: 24px;">
                                <a href="${financeQueueUrl}" class="button">Process Loans</a>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            });
            return { id: 'zepto-sent', ...resp };
        } catch (error: any) {
            console.error("Zepto Service Error (Digest):", error);
            return { error: error.message };
        }
    },

    /**
     * Sends a password reset email
     */
    sendPasswordResetEmail: async (
        emailAddress: string,
        resetLink: string
    ): Promise<SendEmailTokenResponse> => {
        if (!ZEPTO_TOKEN) throw new Error("Missing Zepto API Key");

        try {
            const resp = await client.sendMail({
                from: {
                    address: ZEPTO_FROM_EMAIL,
                    name: ZEPTO_FROM_NAME
                },
                to: [
                    {
                        email_address: {
                            address: emailAddress,
                            name: "User"
                        }
                    }
                ],
                subject: "Reset Your Password - Nolt Finance",
                htmlbody: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2>Reset Your Password</h2>
                        <p>You requested to reset your password. Click the link below to proceed:</p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${resetLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Reset Password</a>
                        </div>
                        
                        <p>This link will expire in 1 hour.</p>
                        <p>If you didn't request this, please ignore this email.</p>
                        <p style="font-size: 12px; color: #666;">Or copy and paste this link: ${resetLink}</p>
                    </div>
                `
            });
            return { id: 'zepto-sent', ...resp };
        } catch (error: any) {
            console.error("Zepto Service Error (Password Reset):", error);
            throw new Error(error.message || "Failed to send password reset email");
        }
    }
};

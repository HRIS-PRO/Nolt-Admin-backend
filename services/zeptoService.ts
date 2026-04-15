import { SendMailClient } from "zeptomail";
import dotenv from 'dotenv';
import pool from '../config/db.js';

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
            return { id: 'zepto-sent', ...(resp as any) };
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
            return { id: 'zepto-sent', ...(resp as any) };
        } catch (error: any) {
            console.error("Zepto Service Error (Welcome):", error);
            throw new Error(error.message || "Failed to send welcome email via Zepto");
        }
    },

    /**
     * Sends a notification to staff members
     */
    sendInvestmentNotification: async (
        emails: string[],
        investmentId: string,
        customerName: string,
        action: string
    ): Promise<SendEmailTokenResponse> => {
        if (!ZEPTO_TOKEN) {
            console.warn("Missing Zepto API Key, skipping notification.");
            return { id: 'skipped-no-key' };
        }
        if (emails.length === 0) return { id: 'skipped-no-recipients' };

        try {
            const dashboardUrl = process.env.FRONTEND_URL || 'https://nolt-finance.vercel.app';
            const investmentUrl = `${dashboardUrl}/staff/investments/${investmentId}`;

            const toRecipients = emails.map(email => ({
                email_address: { address: email, name: "Staff Member" }
            }));

            const resp = await client.sendMail({
                from: {
                    address: ZEPTO_FROM_EMAIL,
                    name: ZEPTO_FROM_NAME
                },
                to: toRecipients,
                subject: `Investment Update: Application ${investmentId} - ${action}`,
                htmlbody: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Investment Application Update</title>
                        <style>
                            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5; }
                            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; margin-top: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                            .header { background-color: #0f172a; padding: 24px; text-align: center; }
                            .header h1 { color: #ffffff; margin: 0; font-size: 20px; letter-spacing: 1px; }
                            .content { padding: 32px; color: #334155; line-height: 1.6; }
                            .info-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 24px 0; }
                            .label { font-size: 12px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 4px; }
                            .value { font-size: 16px; color: #0f172a; font-weight: 600; margin-bottom: 12px; }
                            .button { display: inline-block; background-color: #8b5cf6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 8px; }
                            .footer { background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>NOLT FINANCE</h1>
                            </div>
                            <div class="content">
                                <h2 style="margin-top: 0; color: #0f172a;">Investment Status Update</h2>
                                <p>The status of the following investment application has changed and requires your review.</p>
                                
                                <div class="info-box">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px;">
                                        <div>
                                            <div class="label">Investment ID</div>
                                            <div class="value" style="margin-bottom: 0;">${investmentId}</div>
                                        </div>
                                        <div style="color: #8b5cf6; font-size: 16px; font-weight: 500;">
                                            Customer: ${customerName}
                                        </div>
                                    </div>
                                    
                                    <div class="label" style="margin-top: 16px;">Action Performed</div>
                                    <div class="value" style="color: #10b981;">${action}</div>
                                </div>

                                <div style="text-align: center;">
                                    <a href="${investmentUrl}" style="color: #ffffff;" class="button">Access Investment</a>
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
            return { id: 'zepto-sent', ...(resp as any) };
        } catch (error: any) {
            console.error("Zepto Service Error (Investment Notification):", error);
            return { error: error.message };
        }
    },

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
            let applicantName = "Unknown Applicant";
            try {
                // Fetch the applicant name from the database using the provided loanId
                const loanResult = await pool.query('SELECT applicant_full_name FROM loans WHERE id = $1', [loanId]);
                if (loanResult.rows.length > 0) {
                    applicantName = loanResult.rows[0].applicant_full_name;
                }
            } catch (dbError) {
                console.error("Failed to fetch applicant for email template:", dbError);
            }

            let actionPerformed = "Approval";
            if (stageName.toLowerCase().includes('reject')) {
                actionPerformed = "Rejection";
            } else if (stageName.toLowerCase() === 'assigned' || stageName.toLowerCase() === 'sales') {
                actionPerformed = "Assignment";
            } else if (stageName.toLowerCase() === 'disbursed') {
                actionPerformed = "Approval & Disbursement";
            }

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
                                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px;">
                                        <div>
                                            <div class="label">Loan Application ID</div>
                                            <div class="value" style="margin-bottom: 0;">${loanId}</div>
                                        </div>
                                        <div style="color: #ef4444; font-size: 16px; font-weight: 500;">
                                            name: ${applicantName}
                                        </div>
                                    </div>
                                    
                                    <div class="label" style="margin-top: 16px;">Action Performed</div>
                                    <div class="value" style="color: ${actionPerformed === 'Rejection' ? '#ef4444' : '#10b981'};">${actionPerformed}</div>

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
            return { id: 'zepto-sent', ...(resp as any) };
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
            return { id: 'zepto-sent', ...(resp as any) };
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
                subject: "Reset Your Password - NOLT Finance",
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
            return { id: 'zepto-sent', ...(resp as any) };
        } catch (error: any) {
            console.error("Zepto Service Error (Password Reset):", error);
            throw new Error(error.message || "Failed to send password reset email");
        }
    },

    /**
     * Sends a notification to Customer Experience team requesting CASA Account creation
     */
    sendCASARequestNotification: async (
        emails: string[],
        investmentId: string,
        customerName: string
    ): Promise<SendEmailTokenResponse> => {
        if (!ZEPTO_TOKEN) {
            console.warn("Missing Zepto API Key, skipping CASA Request notification.");
            return { id: 'skipped-no-key' };
        }
        if (emails.length === 0) return { id: 'skipped-no-recipients' };

        try {
            const dashboardUrl = process.env.FRONTEND_URL || 'https://nolt-finance.vercel.app';
            const investmentUrl = `${dashboardUrl}/staff/investments/${investmentId}`;

            const toRecipients = emails.map(email => ({
                email_address: { address: email, name: "Customer Experience Team" }
            }));

            const resp = await client.sendMail({
                from: {
                    address: ZEPTO_FROM_EMAIL,
                    name: ZEPTO_FROM_NAME
                },
                to: toRecipients,
                subject: `ACTION REQUIRED: Missing CASA Account for Investment #${investmentId}`,
                htmlbody: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
                        <h2 style="color: #ea580c;">Missing CASA Account Details</h2>
                        <p>Investment <strong>#${investmentId}</strong> for <strong>${customerName}</strong> has been activated, but it is missing a CASA Account Number.</p>
                        <p>A CASA Account Number is strictly required to generate and dispatch the customer's final Investment Certificate.</p>
                        <div style="background-color: #fff7ed; border-left: 4px solid #ea580c; padding: 15px; margin: 20px 0;">
                            <p style="margin: 0; color: #9a3412; font-weight: bold;">Action Needed:</p>
                            <p style="margin: 5px 0 0 0; color: #9a3412;">Please generate the CASA account and securely input it on the administrator dashboard to release the certificate.</p>
                        </div>
                        <a href="${investmentUrl}" style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">Update Investment Records</a>
                    </div>
                `
            });
            return { id: 'zepto-sent', ...(resp as any) };
        } catch (error: any) {
            console.error("Zepto Service Error (CASA Notification):", error);
            return { error: error.message };
        }
    },

    /**
     * Sends the Investment Certificate summary to the customer
     */
    sendInvestmentCertificateWithCASA: async (
        emailAddress: string,
        customerName: string,
        casaNumber: string,
        investmentData: {
            principal: string,
            tenure: string | number,
            interestRate: string | number,
            valueDate: string,
            maturityDate: string,
            interestAmount: string,
            whtAmount: string,
            maturityValue: string,
            investmentType: string,
            id: string | number
        }
    ): Promise<SendEmailTokenResponse> => {
        if (!ZEPTO_TOKEN) {
            console.warn("Missing Zepto API Key, skipping certificate email.");
            return { id: 'skipped-no-key' };
        }

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
                            name: customerName
                        }
                    }
                ],
                subject: "Your NOLT Finance Investment Certificate",
                htmlbody: `
                    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 700px; margin: 40px auto; color: #1e293b; line-height: 1.5; background-color: #f8fafc; padding: 20px;">
                        <div style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
                            
                            <!-- Premium Header -->
                            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 48px; text-align: center; position: relative; overflow: hidden;">
                                <div style="position: absolute; top: -50px; right: -50px; width: 150px; height: 150px; background: rgba(255,255,255,0.03); border-radius: 50%;"></div>
                                <div style="position: absolute; bottom: -30px; left: -30px; width: 100px; height: 100px; background: rgba(255,255,255,0.03); border-radius: 50%;"></div>
                                
                                <h1 style="margin: 0; font-size: 32px; font-weight: 800; letter-spacing: 4px; text-transform: uppercase;">NOLT</h1>
                                <div style="height: 2px; width: 40px; background-color: #38bdf8; margin: 8px auto;"></div>
                                <p style="margin: 10px 0 0 0; font-size: 11px; font-weight: 600; opacity: 0.8; letter-spacing: 2px; text-transform: uppercase;">Investment Certificate</p>
                            </div>
                            
                            <div style="padding: 48px;">
                                <div style="margin-bottom: 32px; border-left: 4px solid #38bdf8; padding-left: 20px;">
                                    <p style="color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">CERTIFIED INVESTOR</p>
                                    <h2 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: 800;">${customerName}</h2>
                                    <p style="color: #38bdf8; font-size: 14px; font-weight: 700; margin: 4px 0 0 0;">CASA Account: <span style="letter-spacing: 0.5px;">${casaNumber}</span></p>
                                    <p style="color: #64748b; font-size: 11px; font-weight: 700; margin: 8px 0 0 0; text-transform: uppercase; letter-spacing: 0.5px;">
                                        ID: <span style="color: #0f172a; font-weight: 800;">INV-${investmentData.id}</span> 
                                        <span style="margin: 0 10px; color: #cbd5e1;">|</span>
                                        Plan: <span style="color: #0f172a; font-weight: 800;">${investmentData.investmentType}</span>
                                    </p>
                                </div>
                                
                                <p style="font-size: 15px; color: #475569; margin-bottom: 24px;">This document certifies that the above-named individual has successfully committed an investment with <strong>Nolt Finance Company Ltd</strong> under the following terms:</p>
                                
                                <!-- Modern Data Grid -->
                                <div style="background-color: #f1f5f9; border-radius: 12px; padding: 2px; overflow: hidden; border: 1px solid #e2e8f0;">
                                    <table style="width: 100%; border-collapse: collapse;">
                                        <tbody>
                                            <tr style="border-bottom: 1px solid #e2e8f0;">
                                                <td style="padding: 16px 20px; font-size: 13px; color: #64748b; font-weight: 600; width: 40%;">Principal Amount</td>
                                                <td style="padding: 16px 20px; font-size: 15px; color: #0f172a; font-weight: 800; text-align: right;">₦${investmentData.principal}</td>
                                            </tr>
                                            <tr style="border-bottom: 1px solid #e2e8f0;">
                                                <td style="padding: 16px 20px; font-size: 13px; color: #64748b; font-weight: 600;">Investment Tenure</td>
                                                <td style="padding: 16px 20px; font-size: 14px; color: #0f172a; font-weight: 700; text-align: right;">${investmentData.tenure} Days</td>
                                            </tr>
                                            <tr style="border-bottom: 1px solid #e2e8f0;">
                                                <td style="padding: 16px 20px; font-size: 13px; color: #64748b; font-weight: 600;">Effective Interest Rate</td>
                                                <td style="padding: 16px 20px; font-size: 14px; color: #0f172a; font-weight: 700; text-align: right;">${investmentData.interestRate}% P.A</td>
                                            </tr>
                                            <tr style="border-bottom: 1px solid #e2e8f0;">
                                                <td style="padding: 16px 20px; font-size: 13px; color: #64748b; font-weight: 600;">Maturity Date</td>
                                                <td style="padding: 16px 20px; font-size: 14px; color: #0f172a; font-weight: 700; text-align: right;">${investmentData.maturityDate}</td>
                                            </tr>
                                            <tr style="border-bottom: 1px solid #e2e8f0;">
                                                <td style="padding: 16px 20px; font-size: 13px; color: #64748b; font-weight: 600;">Gross Interest</td>
                                                <td style="padding: 16px 20px; font-size: 14px; color: #0f172a; font-weight: 700; text-align: right;">₦${investmentData.interestAmount}</td>
                                            </tr>
                                            <tr style="border-bottom: 1px solid #e2e8f0;">
                                                <td style="padding: 16px 20px; font-size: 13px; color: #64748b; font-weight: 600;">Tax Deducted (WHT)</td>
                                                <td style="padding: 16px 20px; font-size: 14px; color: #ef4444; font-weight: 700; text-align: right;">- ₦${investmentData.whtAmount}</td>
                                            </tr>
                                            <tr style="background-color: #ffffff;">
                                                <td style="padding: 20px; font-size: 14px; color: #0f172a; font-weight: 800;">Net Maturity Value</td>
                                                <td style="padding: 20px; font-size: 20px; color: #10b981; font-weight: 900; text-align: right;">₦${investmentData.maturityValue}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                
                                <!-- Legal Disclosure -->
                                <div style="margin-top: 32px; padding: 20px; background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;">
                                    <p style="margin: 0; color: #92400e; font-size: 11px; line-height: 1.6; font-style: italic;">
                                        <strong>Important Disclosure:</strong> Pre-liquidation of this investment before the maturity date specified above will attract a 30% charge on the accrued interest. In the event that no instructions are received upon maturity, the principal and net interest will be automatically rolled over at the prevailing terms and conditions.
                                    </p>
                                </div>
                                
                                <!-- Digital Signature/Stamp Mock -->
                                <div style="margin-top: 40px; text-align: right;">
                                    <div style="display: inline-block; border: 2px solid #0f172a; padding: 8px 16px; border-radius: 4px; transform: rotate(-5deg);">
                                        <p style="margin: 0; font-size: 10px; font-weight: 900; color: #0f172a; text-transform: uppercase;">Electronically Certified</p>
                                        <p style="margin: 0; font-size: 8px; font-weight: 600; color: #64748b;">Nolt Finance (RC 1234567)</p>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Footer -->
                            <div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                                <p style="margin: 0; font-size: 11px; color: #94a3b8; font-weight: 500;">&copy; 2026 Nolt Finance Company Ltd. All rights reserved.</p>
                            </div>
                        </div>
                    </div>
                `
            });
            return { id: 'zepto-sent', ...(resp as any) };
        } catch (error: any) {
            console.error("Zepto Service Error (Certificate):", error);
            throw new Error(error.message || "Failed to send certificate email");
        }
    },

    /**
     * Sends an email to the customer on successful investment application
     */
    sendInvestmentSuccessEmail: async (
        emailAddress: string,
        name: string,
        investmentId: string,
        amount: string | number
    ): Promise<SendEmailTokenResponse> => {
        if (!ZEPTO_TOKEN) {
            console.warn("Missing Zepto API Key, skipping investment success email.");
            return { id: 'skipped-no-key' };
        }

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
                subject: "Investment Application Received - NOLT Finance",
                htmlbody: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
                        <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; border: 1px solid #e5e7eb;">
                            <h2 style="color: #111827; margin-top: 0;">Hello ${name},</h2>
                            <p style="color: #4b5563; line-height: 1.6;">We have successfully received your investment application.</p>
                            
                            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
                                <p style="margin: 0; color: #374151;"><strong>Investment ID:</strong> INV-${investmentId}</p>
                                <p style="margin: 8px 0 0 0; color: #374151;"><strong>Amount:</strong> ₦${Number(amount).toLocaleString()}</p>
                            </div>

                            <p style="color: #4b5563; line-height: 1.6;">Our team is currently reviewing your application. You will be notified via email once it has been approved and moved to the next stage.</p>
                            
                            <p style="color: #4b5563; margin-bottom: 0;">Thank you for choosing Nolt Finance!</p>
                        </div>
                    </div>
                `
            });
            return { id: 'zepto-sent', ...(resp as any) };
        } catch (error: any) {
            console.error("Zepto Service Error (Investment Success):", error);
            return { error: error.message };
        }
    },

    /**
     * Sends an email to the customer on investment stage update
     */
    sendInvestmentStageUpdateEmail: async (
        emailAddress: string,
        name: string,
        investmentId: string | number,
        newStage: string,
        status: string
    ): Promise<SendEmailTokenResponse> => {
        if (!ZEPTO_TOKEN) {
            console.warn("Missing Zepto API Key, skipping investment stage update email.");
            return { id: 'skipped-no-key' };
        }

        try {
            const getFriendlyStage = (stage: string, status: string) => {
                if (status === 'active') return 'Activated & Generating Certificate';
                if (status === 'rejected') return 'Declined';
                if (stage === 'compliance_review') return 'Internal Compliance Review';
                if (stage === 'finance_review') return 'Treasury & Finance Verification';
                if (stage === 'returned') return 'Returned for Correction';
                return stage.replace(/_/g, ' ');
            };

            const friendlyStage = getFriendlyStage(newStage, status);
            const isNegative = status === 'rejected' || newStage === 'returned';

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
                subject: `Investment Update: INV-${investmentId} - ${friendlyStage}`,
                htmlbody: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
                        <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; border: 1px solid #e5e7eb;">
                            <h2 style="color: #111827; margin-top: 0;">Hello ${name},</h2>
                            <p style="color: #4b5563; line-height: 1.6;">Your investment application status has been updated.</p>
                            
                            <div style="background-color: ${isNegative ? '#fef2f2' : '#f0f9ff'}; border-left: 4px solid ${isNegative ? '#ef4444' : '#0ea5e9'}; padding: 15px; border-radius: 6px; margin: 20px 0;">
                                <p style="margin: 0; color: #374151;"><strong>Investment ID:</strong> INV-${investmentId}</p>
                                <p style="margin: 8px 0 0 0; color: #374151;"><strong>Current Stage:</strong> <span style="text-transform: uppercase; font-weight: 800; color: ${isNegative ? '#b91c1c' : '#0369a1'};">${friendlyStage}</span></p>
                            </div>

                            <p style="color: #4b5563; line-height: 1.6;">
                                ${status === 'active'
                        ? 'Congratulations! Your investment is now active. You will receive your official certificate shortly.'
                        : status === 'rejected'
                            ? 'Unfortunately, your investment application has been declined at this time. Please contact support for more details.'
                            : 'Our team has moved your application to the next review stage. We will continue to keep you updated on its progress.'}
                            </p>
                            
                            <p style="color: #4b5563; margin-bottom: 0;">Thank you for your patience,<br/><strong>Nolt Finance Team</strong></p>
                        </div>
                    </div>
                `
            });
            return { id: 'zepto-sent', ...(resp as any) };
        } catch (error: any) {
            console.error("Zepto Service Error (Investment Stage Update):", error);
            return { error: error.message };
        }
    }
};


import cron from 'node-cron';
import pool from '../config/db.js';
import { resendService } from './resendService.js';

export const startCronJobs = () => {
    // Schedule task to run at 3:00 PM WAT (Africa/Lagos) every day
    cron.schedule('0 15 * * *', async () => {
        console.log('Running Daily Finance Digest Cron Job...');
        try {
            // 1. Fetch loans in 'finance' stage
            const loansResult = await pool.query(
                `SELECT id, applicant_full_name, requested_loan_amount, eligible_amount 
                 FROM loans 
                 WHERE stage = 'finance' AND status = 'pending'`
            );
            const loans = loansResult.rows;

            if (loans.length === 0) {
                console.log('No loans in finance stage. Skipping digest.');
                return;
            }

            // Format amounts for display
            const formattedLoans = loans.map(loan => ({
                ...loan,
                amount_formatted: new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' })
                    .format(loan.eligible_amount || loan.requested_loan_amount)
            }));

            // 2. Fetch Finance Team & Super Admins
            const teamResult = await pool.query(
                `SELECT email FROM customers 
                 WHERE role IN ('finance', 'super_admin', 'superadmin', 'admin') 
                 AND is_active = true`
            );
            const emails = teamResult.rows.map(row => row.email).filter(email => email);

            if (emails.length > 0) {
                // 3. Send Digest
                await resendService.sendBulkFinanceDigest(emails, formattedLoans);
                console.log(`Finance Digest sent to ${emails.length} recipients for ${loans.length} loans.`);
            } else {
                console.log('No finance/admin users found to email.');
            }

        } catch (error) {
            console.error('Error in Finance Digest Cron Job:', error);
        }
    }, {
        timezone: "Africa/Lagos"
    });

    console.log('Cron Jobs initialized (3:00 PM WAT Daily).');
};


import cron from 'node-cron';
import pool from '../config/db.js';
import { zeptoService as resendService } from './zeptoService.js';

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

            // 2. Set Recipient (Hardcoded as requested)
            const emails = ['finance@noltfinance.com', 'divineobinali9@gmail.com'];

            // 3. Send Digest
            await resendService.sendBulkFinanceDigest(emails, formattedLoans);
            console.log(`Finance Digest sent to ${emails[0]} for ${loans.length} loans.`);

        } catch (error) {
            console.error('Error in Finance Digest Cron Job:', error);
        }
    }, {
        timezone: "Africa/Lagos"
    });

    // Schedule Rejected Loan Cleanup at Midnight (00:00 WAT)
    cron.schedule('0 0 * * *', async () => {
        console.log('Running Rejected Loan Cleanup Cron Job...');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Find valid IDs first to ensure we target correctly
            const findQuery = `
                SELECT id FROM loans 
                WHERE (status = 'rejected' OR stage = 'rejected') 
                AND updated_at < NOW() - INTERVAL '1 day'
                FOR UPDATE SKIP LOCKED
            `;
            const result = await client.query(findQuery);
            const idsToDelete = result.rows.map(r => r.id);

            if (idsToDelete.length > 0) {
                // Delete related activities first (others cascade)
                // Note: loan_documents and loan_comments cascade, but activities might not
                await client.query('DELETE FROM loan_activities WHERE loan_id = ANY($1)', [idsToDelete]);

                // Delete loans (will cascade to docs/comments)
                await client.query('DELETE FROM loans WHERE id = ANY($1)', [idsToDelete]);

                await client.query('COMMIT');
                console.log(`Cleanup: Deleted ${idsToDelete.length} rejected loans older than 24 hours.`);
            } else {
                await client.query('COMMIT');
                console.log('Cleanup: No old rejected loans found.');
            }

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error in Rejected Loan Cleanup:', error);
        } finally {
            client.release();
        }
    }, {
        timezone: "Africa/Lagos"
    });

    console.log('Cron Jobs initialized (3:00 PM WAT Digest, 00:00 WAT Cleanup).');
};

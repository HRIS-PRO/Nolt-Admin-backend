import dotenv from 'dotenv';
dotenv.config();
import sql from '../config/db.js';

async function addEmailOtpColumns() {
    try {
        await sql`
            ALTER TABLE customers 
            ADD COLUMN IF NOT EXISTS email_otp VARCHAR(6),
            ADD COLUMN IF NOT EXISTS email_otp_expires_at TIMESTAMP;
        `;
        console.log("Table 'customers' altered: Added email_otp and email_otp_expires_at.");
        process.exit(0);
    } catch (error) {
        console.error("Error altering table:", error);
        process.exit(1);
    }
}

addEmailOtpColumns();

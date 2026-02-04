
import sql from '../config/db.js';

async function addReferralAndMarketing() {
    try {
        // 1. Add referral_code to customers
        await sql`
            ALTER TABLE customers 
            ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
        `;
        console.log("Column 'referral_code' added to 'customers'.");

        // 2. Create marketing table
        await sql`
            CREATE TABLE IF NOT EXISTS marketing (
                id SERIAL PRIMARY KEY,
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                hear_about_us TEXT,
                referral_code TEXT,
                officer_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        console.log("Table 'marketing' created successfully.");

        process.exit(0);
    } catch (error) {
        console.error("Error running migration:", error);
        process.exit(1);
    }
}

addReferralAndMarketing();

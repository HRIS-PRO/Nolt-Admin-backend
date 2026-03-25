import 'dotenv/config';
import pool from '../config/db.js';

const runMigration = async () => {
    const client = await pool.connect();
    try {
        console.log("Running migration: create_investment_gifts_table...");

        await client.query(`
            CREATE TABLE IF NOT EXISTS investment_gifts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                gifter_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                recipient_email TEXT NOT NULL,
                gift_token UUID UNIQUE DEFAULT gen_random_uuid(),
                
                -- Locked configurations
                plan_name TEXT NOT NULL,
                amount NUMERIC(15, 2) NOT NULL,
                tenure_months INTEGER NOT NULL,
                currency TEXT NOT NULL DEFAULT 'NGN',
                interest_rate NUMERIC(10, 2) NOT NULL,
                
                -- Payment tracking
                payment_reference TEXT UNIQUE,
                status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'claimed')),
                
                -- Reference to the finalized investment
                investment_id INTEGER REFERENCES investments(id),
                
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("Table 'investment_gifts' created successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    } finally {
        client.release();
    }
};

runMigration();

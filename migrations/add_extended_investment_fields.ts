import 'dotenv/config';
import pool from '../config/db.js';

const runMigration = async () => {
    try {
        console.log("Running migration: add_extended_investment_fields...");

        await pool.query(`
            ALTER TABLE investments 
            ADD COLUMN IF NOT EXISTS title TEXT,
            ADD COLUMN IF NOT EXISTS gender TEXT,
            ADD COLUMN IF NOT EXISTS dob DATE,
            ADD COLUMN IF NOT EXISTS mother_maiden_name TEXT,
            ADD COLUMN IF NOT EXISTS religion TEXT,
            ADD COLUMN IF NOT EXISTS marital_status TEXT,
            ADD COLUMN IF NOT EXISTS is_on_behalf BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS representative_relation TEXT,
            ADD COLUMN IF NOT EXISTS is_pep BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS nok_name TEXT,
            ADD COLUMN IF NOT EXISTS nok_relationship TEXT,
            ADD COLUMN IF NOT EXISTS nok_address TEXT,
            ADD COLUMN IF NOT EXISTS target_amount DECIMAL(20, 2),
            ADD COLUMN IF NOT EXISTS rollover_option TEXT;
        `);

        console.log("Migration 'add_extended_investment_fields' completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();

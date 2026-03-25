
import 'dotenv/config';
import pool from '../config/db.js';

const runMigration = async () => {
    try {
        console.log("Running migration: add_extended_docs_to_investments...");

        await pool.query(`
            ALTER TABLE investments 
            ADD COLUMN IF NOT EXISTS utility_bill_url TEXT,
            ADD COLUMN IF NOT EXISTS secondary_id_url TEXT,
            ADD COLUMN IF NOT EXISTS payment_receipt_url TEXT;
        `);

        console.log("Migration 'add_extended_docs_to_investments' completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();

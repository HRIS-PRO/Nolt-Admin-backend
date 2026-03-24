
import 'dotenv/config';
import pool from '../config/db.js';

const runMigration = async () => {
    try {
        console.log("Running migration: add_payment_reference_to_investments...");

        await pool.query(`
            ALTER TABLE investments 
            ADD COLUMN IF NOT EXISTS payment_reference TEXT;
        `);

        console.log("Migration 'add_payment_reference_to_investments' completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runMigration();
